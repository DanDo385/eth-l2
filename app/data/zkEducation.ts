import type { ZkInspectPayload } from "../types";
import { BATCH_WINDOW } from "./protocol";

export interface ZkTourStep {
  id: "claim" | "prove" | "verify";
  title: string;
  beat: string;
  concept: string;
  detail: (data: ZkInspectPayload) => string;
  /** First-principles aside, what the jargon in this step actually means. */
  deepDive: string;
}

/** Three beats every ZK rollup follows, simplified for the demo tour. */
export const ZK_TOUR_STEPS: ZkTourStep[] = [
  {
    id: "claim",
    title: "State claim",
    beat: "① Post to L1",
    concept:
      "The sequencer publishes a batch header: which L2 blocks, how many swaps, and the claimed post-state root. Nothing is trusted yet, it is just a claim on L1.",
    detail: (d) =>
      `Batch #${d.batchId} closes at L2 block ${d.l2EndBlock} (window of ~${BATCH_WINDOW} blocks). The header hash becomes the public input the proof must match.`,
    deepDive:
      "“Public input” means the handful of values everyone can see and agree on: the old state root, the new state root, and the batch of transactions. The proof in step ② is mathematically bound to these exact values, it can only verify if the new root really is what you get by applying those transactions to the old root. Change one balance and the public input changes, so the old proof no longer fits.",
  },
  {
    id: "prove",
    title: "Validity proof",
    beat: "② Prove off-chain",
    concept:
      "A prover re-runs every swap inside a circuit and produces a short proof that the new state root follows from correct execution. Real rollups use SNARKs/STARKs. This demo uses a labeled stand-in (ZkValidityVerifier) that re-executes the batch on L1 to check validity: same guarantee, but not succinct. The proving-time and constraint numbers below are simulated to show what a real prover would report.",
    detail: (d) =>
      `Simulated prover checked ~${d.constraints.toLocaleString()} constraints in ~${d.proveMs} ms. In a real ZK rollup that heavy work happens off-chain and L1 never re-executes the swaps.`,
    deepDive:
      "A “constraint” is one arithmetic rule the execution must obey, e.g. “balanceB_after = balanceB_before + amountOut” or “amountOut = gross − fee”. Every step of every swap becomes thousands of these equations. The prover finds one assignment of numbers that satisfies all of them at once and compresses that fact into a few hundred bytes. Crucially, the fee constraint is non-negotiable: the subtle lie that slips past an optimistic challenge window simply cannot produce a satisfying proof here.",
  },
  {
    id: "verify",
    title: "On-chain verify",
    beat: "③ L1 decides",
    concept:
      "The verifier re-derives the honest post-state root from the witness and compares it to the sequencer's claim. Match → batch finalizes immediately and the canonical root advances. Mismatch → rejected at the gate, canonical root untouched. A lie and an honest-intent bug are rejected the same way. No challenge window, no bisection, no watchers required.",
    detail: (d) =>
      d.accepted
        ? `Verified on L1 in ~${d.verifyGas.toLocaleString()} gas (real, measured). This batch is final, there is nothing for a challenger to dispute.`
        : `Rejected on L1 in ~${d.verifyGas.toLocaleString()} gas. The canonical root did not move; the invalid state never finalized.`,
    deepDive:
      "In a real ZK rollup, verification is a fixed, tiny computation no matter how many swaps were in the batch, and that asymmetry (expensive to prove, cheap to verify) is the whole point. This demo's stand-in instead RE-EXECUTES the batch to check it, so its verify gas grows with the number of swaps. That is exactly what a succinct proof removes. Either way, if the sequencer's claimed root does not match honest re-execution, it cannot settle: honest math is the only way to get accepted, whether the deviation was fraud or a bug.",
  },
];

export interface OpZkContrastRow {
  topic: string;
  optimistic: string;
  zk: string;
}

export const OP_VS_ZK_ROWS: OpZkContrastRow[] = [
  {
    topic: "Default assumption",
    optimistic: "Sequencer is honest until someone challenges",
    zk: "Every batch must carry a validity proof",
  },
  {
    topic: "When fraud is caught",
    optimistic: "After a challenge window (bisection → opcode replay)",
    zk: "At submit time, verifier rejects invalid proofs",
  },
  {
    topic: "Cost shape",
    optimistic: "Cheap to post, expensive to dispute",
    zk: "Expensive to prove off-chain, cheap to verify on L1",
  },
];

export const ZK_PIPELINE_BEATS = [
  {
    num: "①",
    label: "Claim",
    hint: "Header + state root on L1",
  },
  {
    num: "②",
    label: "Prove",
    hint: "Off-chain witness & constraints",
  },
  {
    num: "③",
    label: "Verify",
    hint: "Instant accept / reject",
  },
] as const;

export function zkVerdictLabel(accepted: boolean): string {
  return accepted ? "Verified on L1" : "Rejected on L1";
}

export function zkOneLiner(data: ZkInspectPayload): string {
  return data.accepted
    ? `Batch #${data.batchId}: proof checked out, finalized with no waiting period.`
    : `Batch #${data.batchId}: bad proof, L1 refused to finalize this state.`;
}
