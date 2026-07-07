"use client";

import { useAppStore } from "../lib/store";
import type { BatchInfo, ZkInspectPayload } from "../types";

function opEntries(batches: Record<number, BatchInfo>): BatchInfo[] {
  return Object.values(batches)
    .filter((b) => b.resolved && b.divergence)
    .sort((a, b) => b.batchId - a.batchId);
}

function zkEntries(rollups: Record<number, ZkInspectPayload>): ZkInspectPayload[] {
  return Object.values(rollups).sort((a, b) => b.batchId - a.batchId);
}

interface Props {
  mode?: "all" | "optimistic" | "zk";
}

export function ResearchPanel({ mode = "all" }: Props) {
  const { state, dispatch } = useAppStore();
  const showOp = mode === "all" || mode === "optimistic";
  const showZk = mode === "all" || mode === "zk";
  const opProofs = opEntries(state.batches);
  const zkProofs = zkEntries(state.zkRollups);
  const hasContent = (showOp && opProofs.length > 0) || (showZk && zkProofs.length > 0);

  function openOpProof(batchId: number) {
    dispatch({ type: "INSPECT_BATCH", batchId });
    dispatch({ type: "SHOW_OPCODE_RACE", batchId });
    dispatch({ type: "MARK_EXPLORED", lane: "op", batchId });
  }

  function openZkProof(batchId: number) {
    dispatch({ type: "SHOW_ZK_INSPECT", batchId });
    dispatch({ type: "MARK_EXPLORED", lane: "zk", batchId });
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Proof lab</p>
        <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
          {mode === "zk"
            ? "Open a ZK proof when you want to inspect witness inputs, proof cost, and L1 verifier output."
            : "Open a proof when you want to study it. Overlays never auto-popup."}
        </p>
      </div>

      {!hasContent && (
        <p className="text-xs text-zinc-600 italic py-2">
          {mode === "zk"
            ? "Start a demo and wait for a ZK batch submission. Validity proof tours appear here."
            : "Start a demo and wait for batches to resolve. Proof artifacts appear here for you to explore on your schedule."}
        </p>
      )}

      {showOp && opProofs.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
            Optimistic: opcode fraud proofs
          </p>
          <ul className="space-y-1.5">
            {opProofs.slice(0, 8).map((b) => {
              const isNew = !state.exploredOpProofs[b.batchId];
              return (
                <li
                  key={b.batchId}
                  className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 font-medium">
                      Batch #{b.batchId}
                      {isNew && (
                        <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-emerald-900/50 text-emerald-400 border border-emerald-800">
                          new
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Blocks {b.l2StartBlock}→{b.l2EndBlock} · diverged at{" "}
                      {b.divergence?.op} (step #{b.divergence?.divergenceIdx})
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openOpProof(b.batchId)}
                    className="shrink-0 text-[10px] px-2 py-1 rounded border border-emerald-800 text-emerald-300 hover:bg-emerald-950/40"
                  >
                    Opcode proof
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showZk && zkProofs.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
            ZK: 3-step concept tour
          </p>
          <p className="text-[10px] text-zinc-600 leading-snug">
            Claim → prove off-chain → verify on L1. Each batch is a live example.
          </p>
          <ul className="space-y-1.5">
            {zkProofs.slice(0, 8).map((z) => {
              const isNew = !state.exploredZkProofs[z.batchId];
              return (
                <li
                  key={z.batchId}
                  className="flex items-start gap-2 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-2"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-zinc-200 font-medium">
                      Batch #{z.batchId}
                      {isNew && (
                        <span className="ml-1.5 text-[9px] px-1 py-0.5 rounded bg-emerald-900/50 text-emerald-400 border border-emerald-800">
                          new
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">
                      Block {z.l2EndBlock} ·{" "}
                      {z.accepted ? (
                        <span className="text-emerald-500">verified on L1</span>
                      ) : (
                        <span className="text-red-400">rejected on L1</span>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openZkProof(z.batchId)}
                    className="shrink-0 text-[10px] px-2 py-1 rounded border border-emerald-800 text-emerald-300 hover:bg-emerald-950/40"
                  >
                    Concept tour
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {showOp && (
      <section className="border-t border-zinc-800 pt-3 space-y-2">
        <p className="text-[10px] font-semibold text-amber-300 uppercase tracking-wide">
          What happens when an optimistic root is challenged?
        </p>
        <ol className="space-y-1.5 text-[10px] text-zinc-500 leading-relaxed list-decimal list-inside">
          <li>The challenge targets a claimed L2 output root or assertion, not usually one transaction directly.</li>
          <li>The challenger verifies locally first by deriving the expected state from posted L1 data.</li>
          <li>The challenger posts a bond so invalid challenges are costly.</li>
          <li>The dispute game narrows the disagreement from a batch to a trace segment to one execution step.</li>
          <li>Ethereum verifies the small disputed step or records the final dispute result, not the whole L2 by default.</li>
          <li>A successful challenge rejects the bad root and prevents withdrawals that rely on it.</li>
          <li>Legitimate transactions in available batch data are not thrown away just because the claimed root was wrong.</li>
          <li>Honest nodes re-derive the correct chain and state from available L1 data.</li>
          <li>Forced inclusion is separate from fraud proving. It addresses sequencer censorship, not wrong execution.</li>
        </ol>
      </section>
      )}

      {showZk && (
      <section className="border-t border-zinc-800 pt-3 space-y-2">
        <p className="text-[10px] font-semibold text-emerald-300 uppercase tracking-wide">
          What happens when a ZK proof reaches L1?
        </p>
        <ol className="space-y-1.5 text-[10px] text-zinc-500 leading-relaxed list-decimal list-inside">
          <li>The prover builds a witness from the L2 execution trace and public inputs.</li>
          <li>The operator pays proving cost off-chain and submits proof data to L1.</li>
          <li>The verifier contract checks the proof against the claimed state transition.</li>
          <li>If the proof verifies, L1 accepts the new state root and bridge finality advances.</li>
          <li>If the proof fails, L1 rejects that update at the validity gate.</li>
          <li>A failed ZK proof does not become an optimistic fraud-proof game.</li>
        </ol>
      </section>
      )}
    </div>
  );
}
