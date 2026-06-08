import type { BatchInfo } from "../types";
import { BATCH_WINDOW } from "./protocol";

export interface BatchStatusInfo {
  label: string;
  short: string;
  explanation: string;
  border: string;
  bg: string;
}

export function batchWindowNote(batch: BatchInfo): string {
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
          ? `Challenge resolved on L1: honest trace and sequencer trace disagree at ${batch.divergence.op} (step #${batch.divergence.divergenceIdx}). The batch is rejected.`
          : "This batch was challenged and rejected on L1.",
      border: "border-red-500",
      bg: "bg-red-950/40",
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
    return {
      label: "Verified",
      short: "✓",
      explanation: "Posted state root matches honest replay, no challenge needed.",
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
    label: "Fraud proven",
    short: "✗",
    border: "border-red-500",
    bg: "bg-red-950/40",
    description: "The dispute game resolved against the sequencer. The exact fraudulent opcode is recorded on L1. Batch rejected.",
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
    body: "An independent node replays every swap in the batch using the verified engine. If its computed state root doesn't match the sequencer's posted root, it flags the batch yellow.",
    color: "text-yellow-400",
    border: "border-yellow-800",
  },
  {
    n: "4",
    title: "Challenger bisects on L1",
    body: "The challenger posts a bond and opens a dispute. A bisection game on L1 narrows the entire batch execution down to one disagreed-upon opcode, no need to re-run everything.",
    color: "text-orange-400",
    border: "border-orange-800",
  },
  {
    n: "5",
    title: "Fraud proof wins",
    body: "The single diverging opcode (often an SSTORE with a wrong balance) is committed on-chain. The sequencer loses its bond, the batch is rejected, and the honest state is restored.",
    color: "text-red-400",
    border: "border-red-800",
  },
] as const;
