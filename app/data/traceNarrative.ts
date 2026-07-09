import type { BatchInfo, FilteredStep } from "../types";
import { BPS_DENOMINATOR, SWAP_FEE_BPS } from "./protocol";

// ─────────────────────────────────────────────────────────────────────────────
// First-principles narration for the opcode fraud proof.
//
// The backend ships a *filtered* trace: only the opcodes that read state, write
// state, call other contracts, or end execution survive. Everything else
// (arithmetic, jumps, memory shuffling) is deterministic given identical inputs,
// so it can never be the hiding place for fraud. These helpers turn the raw hex
// in each step into something a human can read: "writes 10,000 token-B into the
// trader's balance" instead of "SSTORE 0x9c2f… = 0x2710".
// ─────────────────────────────────────────────────────────────────────────────

export type EngineType = BatchInfo["engineType"];

// ── Hex word decoding ────────────────────────────────────────────────────────

export type WordKind = "number" | "hash" | "zero" | "empty";

export interface DecodedWord {
  raw: string;
  kind: WordKind;
  /** Human-friendly rendering: a grouped decimal, a shortened hash, or a dash. */
  display: string;
  value?: bigint;
}

function normHex(hex?: string | null): string {
  if (!hex) return "";
  const h = hex.toLowerCase();
  return h.startsWith("0x") ? h.slice(2) : h;
}

export function shortHex(hex?: string | null): string {
  const h = normHex(hex);
  if (!h) return "-";
  if (h.length <= 16) return "0x" + h;
  return "0x" + h.slice(0, 6) + "…" + h.slice(-4);
}

/**
 * Decode a 32-byte EVM word. Small values (fit in 64 bits) are token amounts,
 * nonces, or counters and render as grouped decimals. Large values are hashes
 * (state roots, swap-record hashes) and render shortened.
 */
export function decodeWord(hex?: string | null): DecodedWord {
  const h = normHex(hex);
  if (!h) return { raw: "", kind: "empty", display: "-" };
  let value: bigint;
  try {
    value = BigInt("0x" + h);
  } catch {
    return { raw: hex ?? "", kind: "empty", display: shortHex(hex) };
  }
  if (value === 0n) {
    return { raw: hex ?? "", kind: "zero", value, display: "0  (slot empty / unset)" };
  }
  // Anything that fits in 64 bits is a plausible balance / nonce / counter.
  if (value < 1n << 64n) {
    return {
      raw: hex ?? "",
      kind: "number",
      value,
      display: value.toLocaleString("en-US"),
    };
  }
  // Otherwise it's a hash-shaped value.
  return { raw: hex ?? "", kind: "hash", value, display: shortHex(hex) };
}

// ── Storage-slot meaning ─────────────────────────────────────────────────────
//
// SwapEngineStorage layout (contracts/l2/SwapEngineStorage.sol):
//   slot 0: _balanceA  mapping(address=>uint)   → key = keccak256(addr, 0)
//   slot 1: _balanceB  mapping(address=>uint)   → key = keccak256(addr, 1)
//   slot 2: _nonces    mapping(address=>uint)   → key = keccak256(addr, 2)
//   slot 3: _nextSwapId(uint64) + _swapCount(uint64)  (packed, literal slot 3)
//   slot 4: _stateRoot bytes32                   (literal slot 4)
//   slot 5: _swapHashes mapping(uint64=>bytes32) → key = keccak256(swapId, 5)
//
// Only slots 3 and 4 appear as literal low numbers in a trace. Mapping entries
// appear as 32-byte keccak hashes, so we can only name them by likelihood.

export interface SlotMeaning {
  label: string;
  detail: string;
  literal: boolean;
}

export function slotMeaning(slot?: string | null, engineType?: EngineType): SlotMeaning {
  const h = normHex(slot);
  if (!h) {
    return { label: "-", detail: "No storage slot recorded for this step.", literal: false };
  }
  const value = (() => {
    try {
      return BigInt("0x" + h);
    } catch {
      return -1n;
    }
  })();

  if (value === 4n) {
    return {
      label: "_stateRoot (slot 4)",
      detail:
        "The rolling 32-byte hash that summarizes the entire L2 state. Each swap folds its record into this hash; the sequencer posts the final value to L1. If any swap was wrong, this hash is wrong.",
      literal: true,
    };
  }
  if (value === 3n) {
    return {
      label: "_nextSwapId / _swapCount (slot 3)",
      detail:
        "Two packed uint64 counters: the next swap id and the total swap count. Incremented once per swap.",
      literal: true,
    };
  }
  if (value >= 0n && value <= 2n) {
    const names = ["_balanceA", "_balanceB", "_nonces"];
    return {
      label: `${names[Number(value)]} base (slot ${value})`,
      detail:
        "The base slot of a per-account mapping. Real entries live at keccak256(account, slot), so seeing the bare base slot is unusual.",
      literal: true,
    };
  }
  // A 32-byte keccak hash → a mapping entry. We can't reverse it, but for the
  // subtle-fee fraud the very first diverging write is the trader's token-B
  // balance, so that's the most useful guess to surface.
  const guess =
    engineType === "subtle"
      ? "Almost certainly the trader's token-B balance, _balanceB[trader], stored at keccak256(trader, 1). This is where the skipped fee gets credited."
      : "A per-account mapping entry: keccak256(account, baseSlot). Given the values, it is the trader's token-B balance being written with the wrong output amount.";
  return {
    label: "hashed mapping slot",
    detail: `Storage key ${shortHex(slot)} is a keccak256 hash, not a raw number, that's how Solidity addresses mapping entries. ${guess}`,
    literal: false,
  };
}

// ── Per-step plain-English narration ─────────────────────────────────────────

/** Top-of-stack helpers. stack4 is ordered bottom→top, so the top is last. */
function top(stack4?: string[], fromTop = 0): string | undefined {
  if (!stack4 || stack4.length === 0) return undefined;
  const i = stack4.length - 1 - fromTop;
  return i >= 0 ? stack4[i] : undefined;
}

function storageEntries(step: FilteredStep): [string, string][] {
  return step.storage ? Object.entries(step.storage) : [];
}

/** One-line label for a step, used as the card header. */
export function opHeadline(op: string): string {
  switch (op) {
    case "SLOAD":
      return "Read from on-chain storage";
    case "SSTORE":
      return "Write to on-chain storage";
    case "CALL":
      return "Call another contract";
    case "DELEGATECALL":
      return "Run another contract's code in this storage";
    case "STATICCALL":
      return "Read-only call into another contract";
    case "RETURN":
      return "Finish and hand data back";
    case "REVERT":
      return "Abort and roll everything back";
    case "STOP":
      return "Halt execution";
    default:
      if (op.startsWith("LOG")) return "Emit an event log";
      return op;
  }
}

/**
 * Describe, in plain English, what the contract is doing at this step, decoding
 * the slot and value rather than just echoing the opcode name.
 */
export function describeStep(step: FilteredStep, engineType?: EngineType): string {
  const op = step.op;
  const entries = storageEntries(step);

  if (op === "SLOAD") {
    const slot = top(step.stack4);
    const m = slotMeaning(slot, engineType);
    const loaded = entries[0];
    const val = loaded ? decodeWord(loaded[1]) : undefined;
    const valStr = val ? ` The value it sees is ${val.display}.` : "";
    return `The engine reads ${m.label} from storage so it can use the current value in this swap's math.${valStr} Both sides must read the same value here, if they don't, they started from different state.`;
  }

  if (op === "SSTORE") {
    const slot = top(step.stack4);
    const valWord = top(step.stack4, 1);
    const m = slotMeaning(slot, engineType);
    const decoded = valWord ? decodeWord(valWord) : entries[0] ? decodeWord(entries[0][1]) : undefined;
    const valStr = decoded ? ` It writes ${decoded.display}.` : "";
    return `The engine commits a new value to ${m.label}.${valStr} This is the step that actually changes the state root, so this is exactly where a lying engine writes a wrong balance or a skipped fee.`;
  }

  if (op === "DELEGATECALL") {
    return "The SwapRouter hands control to the swap engine's code while keeping the router's own storage. This is the hot-swap point: the honest replay forces the verified engine here, while the sequencer's run used whichever engine it chose. From here on we compare only what happens inside the engine.";
  }
  if (op === "CALL") {
    const addr = top(step.stack4, 1);
    return `The contract calls out to ${shortHex(addr)}. We watch the values flowing in and out, a lying engine can return a different swap output here.`;
  }
  if (op === "STATICCALL") {
    return "A read-only call into another contract (no state changes allowed). Used to look up a balance or price. A mismatch would mean the two runs read different external data.";
  }
  if (op === "RETURN") {
    return "Execution finishes and returns data to the caller, typically the swap's output amount. If the returned value differs, the caller (and the posted state root) inherits the wrong number.";
  }
  if (op === "REVERT") {
    return "Execution aborts and every state change in this call is rolled back. If one side reverts and the other claims success, they cannot possibly share the same post-state.";
  }
  if (op === "STOP") {
    return "Execution halts cleanly with no return data.";
  }
  if (op.startsWith("LOG")) {
    return `${op} emits an event to the receipt (e.g. \"Swapped\"). Logs aren't part of the state root, but a diverging log is corroborating evidence that the two runs computed different swap results.`;
  }
  return "A salient step in the engine's execution. If both sides match here, bisection moves on to the next one.";
}

// ── The divergence (the clash) ───────────────────────────────────────────────

export interface DivergenceExplain {
  /** What concrete quantity is being compared at the clash. */
  whatCompared: string;
  honest: DecodedWord;
  claimed: DecodedWord;
  /** Numeric delta sentence when both sides decode to numbers. */
  deltaNote?: string;
  /** Why this engine produced the wrong value, tied to swap math. */
  rootCause: string;
}

/** Expected fee, in token-B, for a given gross output (gross = amountIn * RATE). */
function feeFromGross(gross: bigint): bigint {
  return (gross * BigInt(SWAP_FEE_BPS)) / BigInt(BPS_DENOMINATOR);
}

export function explainDivergence(
  op: string,
  slot: string | undefined,
  honestVal: string | undefined,
  claimedVal: string | undefined,
  engineType?: EngineType,
): DivergenceExplain {
  const honest = decodeWord(honestVal);
  const claimed = decodeWord(claimedVal);
  const m = slotMeaning(slot, engineType);

  let whatCompared: string;
  if (op === "SSTORE") {
    whatCompared = `Both runs are about to write ${m.label}. The fraud proof compares the exact 32-byte value each one stores.`;
  } else if (op === "SLOAD") {
    whatCompared = `Both runs read ${m.label}. They disagree on the value already sitting in storage, meaning they started from different state.`;
  } else if (op === "REVERT" || op === "RETURN") {
    whatCompared = `One run produced a different terminal result (${op}) than the other.`;
  } else {
    whatCompared = `The two runs disagree at this ${op} step.`;
  }

  let deltaNote: string | undefined;
  if (honest.kind === "number" && claimed.kind === "number" && honest.value !== undefined && claimed.value !== undefined) {
    const diff = claimed.value - honest.value;
    const sign = diff > 0n ? "+" : "";
    deltaNote = `Sequencer − honest = ${sign}${diff.toLocaleString("en-US")}. The sequencer's number is ${diff > 0n ? "larger" : "smaller"} than the verified engine allows.`;
  } else if (honest.kind === "hash" || claimed.kind === "hash") {
    deltaNote =
      "These are hash values, so the difference isn't a simple amount, but any single bit of difference proves the inputs that fed the hash were not the same.";
  }

  let rootCause: string;
  if (engineType === "subtle") {
    let feeLine = "";
    if (claimed.kind === "number" && honest.kind === "number" && honest.value !== undefined && claimed.value !== undefined) {
      const diff = claimed.value - honest.value;
      // honest balance reflects net (gross - fee). The gross the lie credited is
      // the claimed value's increment; recover expected fee for a sanity sentence.
      const expectedFee = feeFromGross(claimed.value);
      if (diff > 0n) {
        feeLine = ` The ${diff.toLocaleString("en-US")}-token gap is the 0.30% fee the honest engine charges (≈${expectedFee.toLocaleString("en-US")} on this swap) and the lying engine pocketed.`;
      }
    }
    rootCause = `This batch ran LyingSwapEngineSubtle. It computes amountOut = gross instead of gross − 0.30% fee, so it credits the trader too much token-B.${feeLine} Same ABI, same storage layout, only the arithmetic differs — which is why nothing looks wrong until you replay storage writes.`;
  } else if (engineType === "obvious") {
    rootCause =
      'This batch ran LyingSwapEngineObvious: it computes the honest amountOut, then sets amountOut = honest * 2 before writing _balanceB. That value cannot be reproduced by HonestSwapEngine, so the first storage write that depends on amountOut diverges.';
  } else {
    rootCause =
      "The sequencer's engine produced a value the verified engine cannot reproduce from the same inputs. That is the definition of an invalid state transition.";
  }

  return { whatCompared, honest, claimed, deltaNote, rootCause };
}

// ── Filtering summary (answers "why only ~25 opcodes?") ──────────────────────

export function filteringSummary(rawLen?: number, filteredLen?: number): string {
  const raw = rawLen && rawLen > 0 ? rawLen.toLocaleString("en-US") : "thousands of";
  const kept = filteredLen ?? 0;
  return `This single transaction executed ${raw} EVM instructions. The proof keeps only the ${kept} that read storage, write storage, call another contract, or end execution, shown as the steps below. Everything else (arithmetic, comparisons, jumps, memory) is deterministic: given the same inputs it always produces the same result, so it can't be where fraud hides. Fraud can only change the state root by writing a different value to storage, so those writes are the only steps worth replaying on-chain.`;
}

export const TWO_COLUMNS_NOTE =
  "Left = an honest re-execution of the same swap through the verified engine. Right = what the sequencer actually ran. Bisection already proved (with on-chain hashes) that these two agree up to one step and disagree after it, your job is just to look at that one step.";
