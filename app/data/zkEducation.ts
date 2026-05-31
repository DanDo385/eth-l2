import type { ZkInspectPayload } from "../types";
import { BATCH_WINDOW } from "./protocol";

export interface ZkTourStep {
  id: "claim" | "prove" | "verify";
  title: string;
  beat: string;
  concept: string;
  detail: (data: ZkInspectPayload) => string;
}

/** Three beats every ZK rollup follows — simplified for the demo tour. */
export const ZK_TOUR_STEPS: ZkTourStep[] = [
  {
    id: "claim",
    title: "State claim",
    beat: "① Post to L1",
    concept:
      "The sequencer publishes a batch header: which L2 blocks, how many swaps, and the claimed post-state root. Nothing is trusted yet — it is just a claim on L1.",
    detail: (d) =>
      `Batch #${d.batchId} closes at L2 block ${d.l2EndBlock} (window of ~${BATCH_WINDOW} blocks). The header hash becomes the public input the proof must match.`,
  },
  {
    id: "prove",
    title: "Validity proof",
    beat: "② Prove off-chain",
    concept:
      "A prover shows the claim follows from correct execution. Real rollups use SNARKs/STARKs; here VerifierMock stands in — but the split is the same: heavy proving off L1, cheap checking on L1.",
    detail: (d) =>
      `Simulated prover checked ~${d.constraints.toLocaleString()} constraints in ~${d.proveMs} ms. That work happens off-chain; L1 never re-executes every swap.`,
  },
  {
    id: "verify",
    title: "On-chain verify",
    beat: "③ L1 decides",
    concept:
      "The verifier contract checks the proof against the header hash. Accept → batch finalizes immediately. Reject → bad state never enters the chain. No challenge window, no bisection game.",
    detail: (d) =>
      d.accepted
        ? `Proof accepted in ~${d.verifyGas.toLocaleString()} gas. This batch is final — there is nothing for a challenger to dispute.`
        : `Proof rejected in ~${d.verifyGas.toLocaleString()} gas. The batch is discarded; fraudulent state never finalized.`,
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
    zk: "At submit time — verifier rejects invalid proofs",
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
    ? `Batch #${data.batchId}: proof checked out — finalized with no waiting period.`
    : `Batch #${data.batchId}: bad proof — L1 refused to finalize this state.`;
}
