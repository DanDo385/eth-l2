"use client";

import { useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../lib/store";
import { apiPost } from "../lib/ws";
import {
  batchStatus,
  batchWindowNote,
  engineExplanation,
} from "../data/batchEducation";
import { PORTAL_BOND_ETH } from "../data/protocol";

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
  const { state, dispatch, refreshState } = useAppStore();
  const batchId = state.inspectedBatch;
  const batch = batchId !== null ? state.batches[batchId] : null;
  const status = batch ? batchStatus(batch) : null;

  useEffect(() => {
    if (batchId === null) return;
    void refreshState();
  }, [batchId, refreshState]);

  useEffect(() => {
    if (batchId === null || !batch || batch.resolved || !batch.flagged) return;
    const timer = setInterval(() => {
      void refreshState();
    }, 1500);
    return () => clearInterval(timer);
  }, [batchId, batch?.flagged, batch?.challenged, batch?.resolved, refreshState]);

  async function handleChallenge() {
    if (!batch) return;
    try {
      await apiPost("/api/challenge", { batchId: batch.batchId });
      await refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Challenge failed";
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    }
  }

  return (
    <AnimatePresence>
      {batch && status && (
        <motion.div
          key={batch.batchId}
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
              aria-label="Close batch inspector"
              className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div
            className={`rounded-lg border p-2.5 space-y-1 ${status.border} ${status.bg}`}
          >
            <p className="text-xs font-semibold text-zinc-200">{status.label}</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{status.explanation}</p>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed border-l-2 border-zinc-700 pl-2">
            {batchWindowNote(batch)}
          </p>

          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Engine</span>
              {engineBadge(batch.engineType)}
            </div>
            <p className="text-[10px] text-zinc-600 leading-snug">
              {engineExplanation(batch.engineType)}
            </p>
            <div className="flex justify-between pt-1">
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

          {batch.flagged && batch.postedRoot && batch.expectedRoot && (
            <div className="border-t border-zinc-800 pt-3 space-y-2 text-xs">
              <p className="text-zinc-500 uppercase tracking-wide">Root mismatch</p>
              <div>
                <span className="text-red-400">Sequencer posted</span>
                <p className="font-mono text-zinc-400 break-all text-[10px]">
                  {hex(batch.postedRoot)}
                </p>
              </div>
              <div>
                <span className="text-emerald-400">Honest replay</span>
                <p className="font-mono text-zinc-400 break-all text-[10px]">
                  {hex(batch.expectedRoot)}
                </p>
              </div>
              <p className="text-[10px] text-zinc-600">
                Challengers post a {PORTAL_BOND_ETH} ETH bond to force bisection on L1.
              </p>
            </div>
          )}

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

          <div className="flex gap-2 pt-1 flex-col">
            {batch.flagged && !batch.challenged && (
              <button onClick={handleChallenge} className="w-full btn-red text-xs">
                Challenge on L1 ({PORTAL_BOND_ETH} ETH bond)
              </button>
            )}
            {batch.resolved && batch.divergence && (
              <button
                onClick={() => onShowOpcodeRace(batch.batchId)}
                className="w-full btn-green text-xs"
              >
                Walk opcode proof step-by-step ↗
              </button>
            )}
            {batch.resolved && batch.divergence && (
              <p className="text-[10px] text-zinc-600 text-center">
                Also listed in Proof lab below when you want to revisit.
              </p>
            )}
            {batch.flagged && !batch.resolved && (
              <p className="text-[10px] text-zinc-600 text-center">
                Auto-challenge may already be running — wait for bisection to finish.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
