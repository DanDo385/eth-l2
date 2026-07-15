import type { BatchInfo } from "../types";
import { BATCH_WINDOW, CHALLENGE_WINDOW_SECONDS, PORTAL_BOND_ETH, SLASH_BURN_BPS } from "./protocol";

export interface BatchStatusInfo {
  label: string;
  short: string;
  explanation: string;
  border: string;
  bg: string;
}

export function batchWindowNote(batch: BatchInfo): string {
  if (batch.txCount === 0 || batch.status === "empty_warmup") {
    return `Warmup batch #${batch.batchId} contains no swap transaction hashes. It can be posted as an empty L1 data point, but there is no fraud-proof target to challenge.`;
  }
  const span = batch.l2EndBlock - batch.l2StartBlock + 1;
  return `Rollups post one state root per batch, not per block. This batch covers ${span} L2 block${span === 1 ? "" : "s"} (${batch.l2StartBlock}→${batch.l2EndBlock}) with ${batch.txCount} swap${batch.txCount === 1 ? "" : "s"}. Fraud invalidates the whole batch.`;
}

export function engineExplanation(type: BatchInfo["engineType"]): string {
  switch (type) {
    case "honest":
      return "The verified swap engine ran, balances and fees match what an honest node would compute.";
    case "obvious":
      return "The sequencer swapped in a lying engine that writes the wrong output amount. Divergence shows up quickly.";
    case "subtle":
      return "The sequencer used a subtly wrong fee rounding path. Same swaps look fine until you replay storage writes.";
    default:
      return "";
  }
}

export function challengeWindowRemaining(submittedAt?: number, nowSec = Math.floor(Date.now() / 1000)): number | null {
  if (!submittedAt) return null;
  const left = submittedAt + CHALLENGE_WINDOW_SECONDS - nowSec;
  return left > 0 ? left : 0;
}

export function challengeWindowNote(batch: BatchInfo): string | null {
  if (batch.finalized || batch.challenged || batch.flagged) return null;
  const left = challengeWindowRemaining(batch.submittedAt);
  if (left === null) return null;
  if (left === 0) {
    return "Challenge window closed - an honest batch can finalize and return the sequencer bond.";
  }
  return `Challenge window: ${left}s remaining. Anyone can dispute before it closes; after that, an honest batch finalizes on L1.`;
}

export function bondSettlementNote(batch: BatchInfo): string | null {
  const b = batch.bondSettlement;
  if (!b) return null;
  const payoutEth = (Number(b.payoutWei) / 1e18).toFixed(3);
  const burnEth = (Number(b.burnedWei) / 1e18).toFixed(3);
  if (b.outcome === "unchallenged") {
    return `No challenge within ${CHALLENGE_WINDOW_SECONDS}s - sequencer recovered ${payoutEth} ETH bond.`;
  }
  const winner = b.winner === "challenger" ? "Challenger" : "Sequencer";
  return `${winner} won the bond pot: ${payoutEth} ETH paid out, ${burnEth} ETH burned from the loser's stake (${SLASH_BURN_BPS / 100}% anti-griefing).`;
}

export function batchStatus(batch?: BatchInfo): BatchStatusInfo {
  if (!batch) {
    return {
      label: "Pending",
      short: "…",
      explanation: `Swaps are accumulating. After ${BATCH_WINDOW} L2 blocks the sequencer will post one state root to L1.`,
      border: "border-zinc-700",
      bg: "bg-zinc-900/40",
    };
  }
  if (batch.resolved) {
    return {
      label: "Fraud proven",
      short: "✗",
      explanation:
        batch.divergence
          ? `FraudProofGame resolved on L1: traces disagreed at ${batch.divergence.op} (step #${batch.divergence.divergenceIdx}). Batch rejected; bonds settled.`
          : "This batch was challenged and rejected on L1; bonds settled.",
      border: "border-red-500",
      bg: "bg-red-950/40",
    };
  }
  if (batch.status === "empty_warmup" || batch.txCount === 0) {
    return {
      label: "Empty warmup",
      short: "∅",
      explanation:
        "This batch has no transaction hashes. It is visible for continuity, but fraud-proof challenge is disabled because there is no execution trace to bisect.",
      border: "border-zinc-700",
      bg: "bg-zinc-900/40",
    };
  }
  if (batch.status === "accepted") {
    return {
      label: "Challenge failed",
      short: "✓",
      explanation:
        "Local or L1 verification found no mismatch. The challenge was invalid, the challenger bond was slashed, and the output root survives.",
      border: "border-emerald-600",
      bg: "bg-emerald-950/30",
    };
  }
  if (batch.finalized && batch.engineType === "honest") {
    return {
      label: "Finalized",
      short: "✓",
      explanation: `No challenge within the ${CHALLENGE_WINDOW_SECONDS}s window. State root accepted; sequencer bond returned.`,
      border: "border-emerald-600",
      bg: "bg-emerald-950/30",
    };
  }
  if (batch.challenged) {
    return {
      label: "Dispute live",
      short: "⚡",
      explanation:
        "A challenger posted a bond on L1. Bisection is narrowing which opcode in the batch execution trace is wrong.",
      border: "border-orange-500",
      bg: "bg-orange-950/40",
    };
  }
  if (batch.status === "verified_mismatch") {
    return {
      label: "Mismatch verified",
      short: "!",
      explanation:
        "The user replayed the batch locally and confirmed the posted output root does not match honest derivation. Challenge is available.",
      border: "border-orange-500",
      bg: "bg-orange-950/40",
    };
  }
  if (batch.status === "verified_valid") {
    return {
      label: "Locally verified",
      short: "✓",
      explanation:
        "Local replay found no mismatch. A challenge is possible in the protocol, but economically irrational because the challenger bond is at risk.",
      border: "border-emerald-600",
      bg: "bg-emerald-950/30",
    };
  }
  if (batch.flagged) {
    return {
      label: "Suspicious",
      short: "⚠",
      explanation:
        batch.flagReason ??
        "The honest watcher replayed every swap in this batch window and computed a different state root than the sequencer posted. Someone should challenge.",
      border: "border-yellow-500",
      bg: "bg-yellow-950/40",
    };
  }
  if (batch.engineType === "honest") {
    const left = challengeWindowRemaining(batch.submittedAt);
    return {
      label: left && left > 0 ? "Challenge window" : "Verified",
      short: left && left > 0 ? "⏳" : "✓",
      explanation:
        left && left > 0
          ? `Posted root matches honest replay. Challengers have ${left}s to dispute before the batch finalizes and the ${PORTAL_BOND_ETH} ETH bond returns.`
          : "Posted state root matches honest replay; waiting for L1 finalization.",
      border: "border-blue-500",
      bg: "bg-blue-950/40",
    };
  }
  return {
    label: "Unchallenged",
    short: "~",
    explanation:
      "Sequencer posted a root but the watcher has not flagged it yet (or the batch is still within the challenge window).",
    border: "border-violet-600",
    bg: "bg-violet-950/30",
  };
}

export function opcodeLesson(op: string): string {
  switch (op) {
    case "SLOAD":
      return "SLOAD reads a value from a contract's persistent storage. Think of it as reading a cell in a spreadsheet that lives on-chain. Both the honest replay and the sequencer's trace must load the same values, a mismatch here means one side saw different state before the swap even ran.";
    case "SSTORE":
      return "SSTORE writes a value into persistent storage, this is where fraud hides most often. A lying swap engine writes the wrong output amount or skips the fee deduction here, producing a different balance in storage. The two storage slots shown below are the exact bytes that diverge between honest and claimed execution.";
    case "REVERT":
      return "REVERT aborts execution and rolls back all state changes. If the honest replay hits REVERT but the sequencer claimed the call succeeded, the posted state root is based on a state transition that shouldn't exist. This is a clear fraud signal.";
    case "DELEGATECALL":
      return "DELEGATECALL lets one contract run another contract's code in its own storage context. The SwapRouter uses this to hot-swap between honest and lying engines without changing addresses. We skip the router layer and compare only the engine's storage operations, which is where the actual swap logic runs.";
    case "CALL":
      return "CALL invokes an external contract. Here it's the router dispatching into the swap engine. We're looking for divergence in the values returned from this call, the lying engine returns a different amountOut.";
    case "STATICCALL":
      return "STATICCALL reads from another contract without modifying state. Used here to check balances or oracle prices. A mismatch means one side read a different contract value, unusual, but worth investigating.";
    case "RETURN":
      return "RETURN ends execution and passes data back to the caller. If the return value differs between honest and claimed traces, the caller receives a wrong result, for example, the wrong swap output amount that the sequencer then posts as the state root.";
    case "LOG0":
    case "LOG1":
    case "LOG2":
    case "LOG3":
    case "LOG4":
      return `${op} emits an event to the transaction receipt. Events aren't part of the state root, but a diverging LOG means the two executions reported different outcomes to off-chain watchers, useful corroborating evidence alongside the SSTORE divergence.`;
    default:
      return "If both traces show the same opcode with the same stack and storage snapshot here, bisection continues to the next step. When they diverge, you have found the exact instruction where honest and claimed execution split.";
  }
}

/** Color-coding key for block boxes in the chain canvas. */
export const BLOCK_COLOR_LEGEND = [
  {
    label: "Verified",
    short: "✓",
    border: "border-blue-500",
    bg: "bg-blue-950/40",
    description: "Batch posted by sequencer; honest watcher's replay produced the same state root. No challenge needed.",
  },
  {
    label: "Suspicious",
    short: "⚠",
    border: "border-yellow-500",
    bg: "bg-yellow-950/40",
    description: "Watcher's replay produced a different state root than what the sequencer posted. A challenger can open a dispute.",
  },
  {
    label: "Dispute live",
    short: "⚡",
    border: "border-orange-500",
    bg: "bg-orange-950/40",
    description: "A challenger posted a bond on L1. The bisection game is running to narrow down which opcode is wrong.",
  },
  {
    label: "Finalized",
    short: "✓",
    border: "border-emerald-600",
    bg: "bg-emerald-950/30",
    description: "Challenge window closed with no dispute. Batch accepted on L1; sequencer bond returned.",
  },
  {
    label: "Fraud proven",
    short: "✗",
    border: "border-red-500",
    bg: "bg-red-950/40",
    description: "The dispute game resolved against the sequencer. FraudProofGame re-executed the diverging step on L1. Batch rejected; bonds settled.",
  },
  {
    label: "Pending",
    short: "…",
    border: "border-zinc-700",
    bg: "bg-zinc-900/40",
    description: "This L2 block's swaps are accumulating. Once the batch window fills, the sequencer will post a state root to L1.",
  },
] as const;

/** How-it-works steps for the onboarding banner. */
export const HOW_IT_WORKS_STEPS = [
  {
    n: "1",
    title: "Trades happen on L2",
    body: "Bots swap tokens on the OP and ZK L2 chains every few seconds. L2 is fast and cheap because it doesn't write every transaction to L1.",
    color: "text-blue-400",
    border: "border-blue-800",
  },
  {
    n: "2",
    title: "Sequencer batches and posts",
    body: "Every 5 L2 blocks the sequencer computes a state root, a single 32-byte hash that summarizes all account balances, and posts it to L1 with a 0.1 ETH bond.",
    color: "text-violet-400",
    border: "border-violet-800",
  },
  {
    n: "3",
    title: "Honest watcher checks",
    body: "An independent node replays every swap in the batch using the verified engine. If its computed state root doesn't match the sequencer's posted root, it flags the batch yellow. A flag is off-chain detection only - L1 does not reject anything until someone challenges.",
    color: "text-yellow-400",
    border: "border-yellow-800",
  },
  {
    n: "4",
    title: "Challenger bisects on L1",
    body: `You verify locally first, then post a ${PORTAL_BOND_ETH} ETH challenge bond and open FraudProofGame. Merkle bisection narrows both execution traces to one disagreed-upon VM step, then the contract re-executes that step on-chain.`,
    color: "text-orange-400",
    border: "border-orange-800",
  },
  {
    n: "5",
    title: "Fraud proof wins",
    body: `The diverging step is proven on L1. The sequencer loses its bond (10% burned), the challenger takes the pot, and the batch is rejected. Honest batches with no challenge finalize after ${CHALLENGE_WINDOW_SECONDS}s.`,
    color: "text-red-400",
    border: "border-red-800",
  },
] as const;
