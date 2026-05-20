"use client";

import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../lib/store";
import { apiPost } from "../lib/ws";

function hex(s: string) {
  return s.length > 18 ? s.slice(0, 10) + "…" + s.slice(-6) : s;
}

function engineBadge(type: string) {
  switch (type) {
    case "honest":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-700">
          honest
        </span>
      );
    case "obvious":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 border border-red-700">
          obvious lie
        </span>
      );
    case "subtle":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-orange-900/50 text-orange-400 border border-orange-700">
          subtle lie
        </span>
      );
    default:
      return null;
  }
}

interface Props {
  onShowOpcodeRace: (batchId: number) => void;
}

export function BlockInspector({ onShowOpcodeRace }: Props) {
  const { state, dispatch } = useAppStore();
  const batchId = state.inspectedBatch;
  const batch = batchId !== null ? state.batches[batchId] : null;

  async function handleChallenge() {
    if (!batch) return;
    await apiPost("/api/challenge", { batchId: batch.batchId });
  }

  return (
    <AnimatePresence>
      {batch && (
        <motion.div
          key="inspector"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-100">
              Batch #{batch.batchId}
            </span>
            <button
              onClick={() => dispatch({ type: "INSPECT_BATCH", batchId: null })}
              className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Engine</span>
              {engineBadge(batch.engineType)}
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Blocks</span>
              <span className="font-mono text-zinc-300">
                {batch.l2StartBlock} → {batch.l2EndBlock}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Tx count</span>
              <span className="font-mono text-zinc-300">{batch.txCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Post root</span>
              <span className="font-mono text-zinc-400">
                {hex(batch.postStateRoot)}
              </span>
            </div>
          </div>

          <div className="flex gap-2 flex-wrap text-xs">
            {batch.flagged && !batch.challenged && (
              <span className="px-2 py-1 rounded bg-yellow-900/40 text-yellow-400 border border-yellow-700">
                ⚠ Flagged
              </span>
            )}
            {batch.challenged && !batch.resolved && (
              <span className="px-2 py-1 rounded bg-orange-900/40 text-orange-400 border border-orange-700">
                ⚡ Challenged
              </span>
            )}
            {batch.resolved && (
              <span className="px-2 py-1 rounded bg-red-900/40 text-red-400 border border-red-700">
                ✗ Resolved invalid
              </span>
            )}
          </div>

          {batch.divergence && (
            <div className="border-t border-zinc-800 pt-3 space-y-1 text-xs">
              <p className="text-zinc-500 uppercase tracking-wide">Divergence</p>
              <div className="flex justify-between">
                <span className="text-zinc-500">Op</span>
                <span className="font-mono text-red-300">{batch.divergence.op}</span>
              </div>
              {batch.divergence.slot && (
                <div className="flex justify-between">
                  <span className="text-zinc-500">Slot</span>
                  <span className="font-mono text-zinc-400">
                    {hex(batch.divergence.slot)}
                  </span>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-zinc-500">Step</span>
                <span className="font-mono text-zinc-300">
                  #{batch.divergence.divergenceIdx}
                </span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {batch.flagged && !batch.challenged && (
              <button
                onClick={handleChallenge}
                className="flex-1 btn-red text-xs"
              >
                Challenge
              </button>
            )}
            {batch.resolved && batch.divergence && (
              <button
                onClick={() => onShowOpcodeRace(batch.batchId)}
                className="flex-1 btn-green text-xs"
              >
                OpcodeRace ↗
              </button>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
