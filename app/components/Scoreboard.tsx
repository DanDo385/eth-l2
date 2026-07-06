"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import type { AppState } from "../types";
import { CHALLENGE_WINDOW_SECONDS } from "../data/protocol";
import { ZkContrastStrip } from "./ZkContrastStrip";

function scoreNums(sb: AppState["scoreboard"]) {
  return {
    zkBatches: safeNum(sb.zkBatches),
    zkAccepted: safeNum(sb.zkAccepted),
    zkRejected: safeNum(sb.zkRejected),
  };
}

export function Scoreboard() {
  const { state } = useAppStore();
  const { zkBatches, zkAccepted, zkRejected } = scoreNums(state.scoreboard);

  const batchList = Object.values(state.batches);
  const opBatches = batchList.length;
  const honest = batchList.filter((b) => b.engineType === "honest").length;
  const fraud = batchList.filter(
    (b) => b.engineType === "obvious" || b.engineType === "subtle",
  ).length;
  const flagged = batchList.filter((b) => b.flagged).length;
  const inDispute = batchList.filter((b) => b.challenged && !b.resolved).length;
  const resolved = batchList.filter((b) => b.resolved).length;
  const detectionRate =
    fraud > 0 ? Math.round((resolved / fraud) * 100) : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Scoreboard</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold text-blue-400">OP: Optimistic</p>
            <p className="text-[9px] text-zinc-700 leading-snug mt-0.5">
              Trust first, prove fraud after
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between" title="Total batches posted to L1 by the sequencer">
              <span className="text-zinc-500">Batches posted</span>
              <span className="font-mono text-zinc-300">{opBatches}</span>
            </div>
            <div className="flex justify-between" title="Batches where state root matched honest replay, no dispute needed">
              <span className="text-zinc-500">✓ Honest</span>
              <span className="font-mono text-emerald-400">{honest}</span>
            </div>
            <div className="flex justify-between" title="Batches using a lying swap engine, state root is wrong">
              <span className="text-zinc-500">⚠ Fraudulent</span>
              <span className="font-mono text-red-400">{fraud}</span>
            </div>
            <div className="flex justify-between" title="Batches flagged by the honest watcher, waiting for a challenger">
              <span className="text-zinc-500">⚡ In dispute</span>
              <span className="font-mono text-orange-400">{inDispute}</span>
            </div>
            <div className="flex justify-between" title="Disputes that finished, sequencer lost bond, batch rejected">
              <span className="text-zinc-500">✗ Resolved fraud</span>
              <span className="font-mono text-red-400">{resolved}</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-700 leading-snug pt-1 border-t border-zinc-800">
            Honest batches finalize after a {CHALLENGE_WINDOW_SECONDS}s challenge window in this sim (production rollups use ~7 days). Bonds make fraud unprofitable even during the wait.
          </p>
        </div>

        <div className="space-y-2">
          <div>
            <p className="text-xs font-semibold text-emerald-400">ZK: Validity</p>
            <p className="text-[9px] text-zinc-700 leading-snug mt-0.5">
              Prove first, accept after
            </p>
          </div>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between" title="Total ZK batches submitted with a proof">
              <span className="text-zinc-500">Batches submitted</span>
              <span className="font-mono text-zinc-300">{zkBatches}</span>
            </div>
            <div className="flex justify-between" title="Proofs the L1 verifier accepted, batch immediately canonical">
              <span className="text-zinc-500">✓ Verified</span>
              <span className="font-mono text-emerald-400">{zkAccepted}</span>
            </div>
            <div className="flex justify-between" title="Invalid proofs rejected at submission, state never touched L1">
              <span className="text-zinc-500">✗ Rejected</span>
              <span className="font-mono text-red-400">{zkRejected}</span>
            </div>
            <div className="flex justify-between" title="ZK batches are final the moment the proof verifies">
              <span className="text-zinc-500">Challenge window</span>
              <span className="font-mono text-emerald-400">0 blocks</span>
            </div>
          </div>
          <p className="text-[10px] text-zinc-700 leading-snug pt-1 border-t border-zinc-800">
            Invalid proofs fail at L1 submission, fraudulent state never becomes canonical. No bond, no bisection, instant finality.
          </p>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2 space-y-1">
        <div className="flex gap-3 text-xs">
          <span className="text-zinc-500" title="Percentage of fraudulent batches that were caught and resolved">OP fraud detection</span>
          <span className="font-mono text-emerald-400">{detectionRate}%</span>
        </div>
        <p className="text-[10px] text-zinc-700 leading-relaxed">
          This reaches 100% because the honest watcher catches every state root mismatch. In production, any full node running the OP software can play the watcher role.
        </p>
      </div>

      <ZkContrastStrip />
    </div>
  );
}
