import type { BatchInfo, SwapSummary } from "../types";
import {
  BATCH_WINDOW,
  CHALLENGE_WINDOW_SECONDS,
  PORTAL_BOND_ETH,
  SLASH_BURN_BPS,
  SWAP_FEE_BPS,
  SWAP_RATE,
  BPS_DENOMINATOR,
} from "./protocol";

/** Pedagogical notes on how this lab differs from mainnet OP Stack rollups. */
export const MAINNET_SIMPLIFICATIONS = [
  {
    title: "Challenge window",
    sim: `${CHALLENGE_WINDOW_SECONDS}s`,
    mainnet: "~7 days on OP Mainnet",
    note: "Compressed so you can watch finalization during a short demo session.",
  },
  {
    title: "Batch granularity",
    sim: `${BATCH_WINDOW} L2 blocks → 1 state root`,
    mainnet: "Varies by sequencer; often minutes of txs",
    note: "One bad swap invalidates the whole batch commitment, same as production.",
  },
  {
    title: "Challenge initiation",
    sim: "User verifies locally, then clicks Challenge",
    mainnet: "Permissionless; anyone with stake can challenge",
    note: "Normal mode does not auto-challenge. The point is to show the economic decision before the L1 transaction.",
  },
  {
    title: "Fraud proof",
    sim: "Single swap VM step on L1",
    mainnet: "Full Cannon / MIPS bisection over millions of steps",
    note: "Same idea - narrow to one instruction - scaled down for teaching.",
  },
  {
    title: "Withdrawals & bridges",
    sim: "Modeled as root accepted, pending, or blocked",
    mainnet: "7-day delay for OP withdrawals after dispute",
    note: "This lab focuses on batch validity, not bridge UX.",
  },
  {
    title: "Re-sequencing",
    sim: "Good swaps shown rolling into the next canonical batch",
    mainnet: "Sequencer re-includes txs; users may see reordering",
    note: "Visual shorthand - we don't replay every tx on-chain in the UI.",
  },
] as const;

export type SwapLifecycleStatus =
  | "canonical"
  | "challenge_window"
  | "suspicious"
  | "in_dispute"
  | "rolled_back"
  | "resequenced"
  | "invalid";

export function swapLifecycleStatus(
  batch: BatchInfo,
  swap: SwapSummary,
): SwapLifecycleStatus {
  if (batch.engineType === "honest") {
    if (batch.finalized) return "canonical";
    if (batch.challenged && !batch.resolved) return "in_dispute";
    return "challenge_window";
  }
  if (batch.resolved) {
    return swap.isDivergent ? "invalid" : "resequenced";
  }
  if (batch.challenged) return "in_dispute";
  if (batch.flagged) return "suspicious";
  return "challenge_window";
}

export function swapStatusLabel(status: SwapLifecycleStatus): string {
  switch (status) {
    case "canonical":
      return "Canonical on L2";
    case "challenge_window":
      return "Soft-confirmed (window open)";
    case "suspicious":
      return "Flagged - awaiting challenge";
    case "in_dispute":
      return "Frozen - dispute live";
    case "rolled_back":
      return "Rolled back with batch";
    case "resequenced":
      return "Re-queued for next batch";
    case "invalid":
      return "Fraud pin - proof target";
  }
}

export function swapStatusColor(status: SwapLifecycleStatus): string {
  switch (status) {
    case "canonical":
      return "text-emerald-400 border-emerald-700 bg-emerald-950/30";
    case "challenge_window":
      return "text-blue-400 border-blue-700 bg-blue-950/30";
    case "suspicious":
      return "text-yellow-400 border-yellow-700 bg-yellow-950/30";
    case "in_dispute":
      return "text-orange-400 border-orange-700 bg-orange-950/30";
    case "rolled_back":
      return "text-orange-400 border-orange-700 bg-orange-950/30";
    case "resequenced":
      return "text-violet-400 border-violet-700 bg-violet-950/30";
    case "invalid":
      return "text-red-400 border-red-700 bg-red-950/30";
  }
}

export function batchPipelineStage(batch: BatchInfo): {
  stage: string;
  detail: string;
  pct: number;
} {
  if (batch.status === "empty_warmup" || batch.txCount === 0) {
    return {
      stage: "Empty warmup",
      detail: "No transaction hashes were posted, so there is no fraud-proof trace to challenge.",
      pct: 10,
    };
  }
  if (batch.resolved) {
    return {
      stage: "Rejected on L1",
      detail: "Fraud proof won; state root discarded; bonds settled.",
      pct: 100,
    };
  }
  if (batch.status === "accepted") {
    return {
      stage: "Challenge failed",
      detail: "No fraud was found. The challenged root survives and the challenger loses bond value.",
      pct: 100,
    };
  }
  if (batch.status === "verified_mismatch") {
    return {
      stage: "Verified mismatch",
      detail: "The user replayed locally and found the posted root differs from honest derivation.",
      pct: 60,
    };
  }
  if (batch.status === "verified_valid") {
    return {
      stage: "Verified valid",
      detail: "Local replay matched. Challenging now is a failed-challenge economics demo.",
      pct: 60,
    };
  }
  if (batch.finalized && batch.engineType === "honest") {
    return {
      stage: "Finalized on L1",
      detail: "Challenge window closed; root is canonical; sequencer bond returned.",
      pct: 100,
    };
  }
  if (batch.challenged) {
    return {
      stage: "Dispute live",
      detail: "FraudProofGame bisecting traces on L1.",
      pct: 75,
    };
  }
  if (batch.flagged) {
    return {
      stage: "Flagged by watcher (off-chain)",
      detail: "Watcher found a root mismatch by local replay. L1 does not know yet - someone must challenge before the window closes.",
      pct: 50,
    };
  }
  return {
    stage: "Posted + challenge window",
    detail: `Sequencer bond locked for ${CHALLENGE_WINDOW_SECONDS}s; watchers may dispute.`,
    pct: 25,
  };
}

export function finalityImpact(batch: BatchInfo): {
  label: string;
  blocksDelayed: number;
  explanation: string;
} {
  const span = batch.l2EndBlock - batch.l2StartBlock + 1;
  if (batch.resolved) {
    return {
      label: "Hard rollback",
      blocksDelayed: span,
      explanation: `All ${batch.txCount} swap(s) in this batch lose soft-finality. Honest swaps must be re-included in a later batch before they are L1-anchored again.`,
    };
  }
  if (batch.finalized) {
    return {
      label: "L1 anchored",
      blocksDelayed: 0,
      explanation: "State root accepted on L1 after the challenge window. L2 users can treat balances as economically final (modulo bridge delays in production).",
    };
  }
  if (batch.flagged || batch.challenged) {
    return {
      label: "Finality frozen",
      blocksDelayed: span,
      explanation: "Neither accepted nor rejected yet - users should not rely on this batch for withdrawals or cross-chain actions.",
    };
  }
  return {
    label: "Soft finality",
    blocksDelayed: 0,
    explanation: `Swaps executed on L2 but only committed via a single state root. ${CHALLENGE_WINDOW_SECONDS}s (or a successful challenge) before L1 finality.`,
  };
}

export function l1ImpactLines(batch: BatchInfo): string[] {
  const lines: string[] = [];
  lines.push(`L1 receives batch data for #${batch.batchId}`);
  lines.push(`L1 receives output root/assertion proposal + ${PORTAL_BOND_ETH} ETH proposer bond`);
  lines.push(`L1 opens the ${CHALLENGE_WINDOW_SECONDS}s challenge window`);
  if (batch.flagged) {
    lines.push("Watcher/user flags suspicious root off-chain after local derivation");
  }
  if (batch.verification) {
    lines.push(`User verifies locally: ${batch.verification.result === "verified_mismatch" ? "mismatch found" : "claim appears valid"}`);
  }
  if (batch.challenged) {
    lines.push(`L1 receives challenge transaction and locks ${PORTAL_BOND_ETH} ETH challenger bond`);
    lines.push("L1 records dispute-game moves: trace commitments, bisection rounds, one-step check");
  }
  if (batch.resolved) {
    lines.push("L1 accepts the final dispute result and rejects the bad output root");
    lines.push("L1 prevents withdrawals or settlement messages that depend on the rejected root");
    if (batch.bondSettlement) {
      const burn = (Number(batch.bondSettlement.burnedWei) / 1e18).toFixed(3);
      lines.push(`L1 transfers/slashes bonds: challenger paid, ${burn} ETH burned (${SLASH_BURN_BPS / 100}% slash)`);
    }
    lines.push("Canonical L2 state follows honest derivation from available L1 data, not the rejected claim");
  }
  if (batch.status === "accepted") {
    lines.push("L1 upholds the output root because no mismatch was proven");
    lines.push("Challenger bond is slashed/transferred for an invalid challenge");
  }
  if (batch.finalized && batch.engineType === "honest") {
    lines.push("finalizeBatch - challenge window expired; bond returned to sequencer");
    lines.push("Withdrawals may finalize against this accepted root");
  }
  return lines;
}

export function rerouteNarrative(batch: BatchInfo, swaps: SwapSummary[]): string {
  const good = swaps.filter((s) => !s.isDivergent);
  const bad = swaps.filter((s) => s.isDivergent);
  if (batch.engineType === "honest") {
    return "All swaps in this batch share one honest state root. After the challenge window they remain canonical.";
  }
  if (!batch.resolved && !batch.flagged && !batch.challenged) {
    return "If fraud is proven, every swap in the batch rolls back together - even swaps that would have been valid in isolation.";
  }
  if (!batch.resolved && batch.challenged) {
    return "Challenge submitted on L1: both bonds are locked while FraudProofGame narrows the disagreement. If the challenger wins the one-step proof, every swap here rolls back together.";
  }
  if (!batch.resolved && batch.flagged) {
    return "Watcher flagged this root off-chain. Nothing has been rejected on L1 yet - a participant must verify locally and submit a challenge before the window closes, or the bad root finalizes.";
  }
  const goodN = good.length;
  const badN = bad.length;
  const nextBatch = batch.batchId + 1;
  if (goodN === 0) {
    return "Fraud batch rejected entirely on L1.";
  }
  return `${goodN} swap${goodN === 1 ? "" : "s"} had valid intent but were bundled with ${badN} fraudulent state transition${badN === 1 ? "" : "s"}. They roll into batch #${nextBatch} (next window) after the bad root is rejected - finality for those users is delayed by at least one batch.`;
}

export function honestAmountOut(amountIn: number): number {
  const gross = amountIn * SWAP_RATE;
  return Math.floor((gross * (BPS_DENOMINATOR - SWAP_FEE_BPS)) / BPS_DENOMINATOR);
}

export function claimedAmountOut(
  amountIn: number,
  engineType: BatchInfo["engineType"],
): number {
  const gross = amountIn * SWAP_RATE;
  const honest = honestAmountOut(amountIn);
  switch (engineType) {
    case "obvious":
      return honest * 2;
    case "subtle":
      return gross;
    default:
      return honest;
  }
}

/** Fallback when /api/state predates swap summaries - deterministic teaching stand-in. */
export function synthesizeSwaps(batch: BatchInfo): SwapSummary[] {
  const count = Math.max(batch.txCount, 1);
  const swaps: SwapSummary[] = [];
  for (let i = 0; i < count; i++) {
    const block = batch.l2StartBlock + Math.min(i, batch.l2EndBlock - batch.l2StartBlock);
    const amountIn = ((batch.batchId * 7 + i * 3) % 20) + 1;
    swaps.push({
      l2Block: block,
      txHash: `0x${batch.batchId.toString(16).padStart(4, "0")}${i.toString(16).padStart(60, "0")}`,
      traderIndex: i % 2,
      amountIn,
      honestOut: honestAmountOut(amountIn),
      claimedOut: claimedAmountOut(amountIn, batch.engineType),
      isDivergent: i === 0 && batch.engineType !== "honest",
    });
  }
  return swaps;
}

export function batchSwaps(batch: BatchInfo): SwapSummary[] {
  if (batch.swaps && batch.swaps.length > 0) return batch.swaps;
  return synthesizeSwaps(batch);
}
