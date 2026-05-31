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

export function ResearchPanel() {
  const { state, dispatch } = useAppStore();
  const opProofs = opEntries(state.batches);
  const zkProofs = zkEntries(state.zkRollups);
  const hasContent = opProofs.length > 0 || zkProofs.length > 0;

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
          The simulation runs quietly in the background. Open a proof when you want to
          study it — overlays never auto-popup.
        </p>
      </div>

      {!hasContent && (
        <p className="text-xs text-zinc-600 italic py-2">
          Start a demo and wait for batches to resolve. Opcode and ZK proofs will appear
          here for you to explore on your schedule.
        </p>
      )}

      {opProofs.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-blue-400 uppercase tracking-wide">
            Optimistic — opcode fraud proofs
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

      {zkProofs.length > 0 && (
        <section className="space-y-2">
          <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
            ZK — validity proofs
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
                    ZK inspect
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
