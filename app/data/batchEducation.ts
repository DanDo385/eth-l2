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
      return "The verified swap engine ran — balances and fees match what an honest node would compute.";
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
      explanation: "Posted state root matches honest replay — no challenge needed.",
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
      return "SLOAD reads a storage slot from contract state. Both sides must load the same values before writing.";
    case "SSTORE":
      return "SSTORE persists state. Fraud often hides here — same swap, different balance or fee slot written.";
    case "REVERT":
      return "REVERT aborts execution. If honest code reverts but the sequencer claimed success, the state transition is invalid.";
    case "DELEGATECALL":
      return "DELEGATECALL runs swap logic in the engine contract. We compare only the engine ops after this hop.";
    case "CALL":
    case "STATICCALL":
      return "External call — often routing into the swap engine under test.";
    default:
      return "Compare this step: if both traces match, bisection continues; if not, you have found the fraud.";
  }
}
