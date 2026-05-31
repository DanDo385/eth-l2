"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import type { AppState } from "../types";

function scoreNums(sb: AppState["scoreboard"]) {
  return {
    opChallenges: safeNum(sb.opChallenges),
    opResolved: safeNum(sb.opResolved),
    zkBatches: safeNum(sb.zkBatches),
    zkAccepted: safeNum(sb.zkAccepted),
    zkRejected: safeNum(sb.zkRejected),
  };
}

export function Scoreboard() {
  const { state } = useAppStore();
  const { opChallenges, opResolved, zkBatches, zkAccepted, zkRejected } =
    scoreNums(state.scoreboard);

  const batchList = Object.values(state.batches);
  const opBatches = batchList.length;
  const honest = batchList.filter((b) => b.engineType === "honest").length;
  const fraud = batchList.filter(
    (b) => b.engineType === "obvious" || b.engineType === "subtle",
  ).length;
  const detectionRate =
    fraud > 0 ? Math.round((opResolved / fraud) * 100) : 0;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Scoreboard</p>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <p className="text-xs font-semibold text-blue-400">OP Optimistic</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Batches</span>
              <span className="font-mono text-zinc-300">{opBatches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Honest</span>
              <span className="font-mono text-emerald-400">{honest}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Fraudulent</span>
              <span className="font-mono text-red-400">{fraud}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Challenged</span>
              <span className="font-mono text-yellow-400">{opChallenges}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Resolved</span>
              <span className="font-mono text-orange-400">{opResolved}</span>
            </div>
            <p className="text-[10px] text-zinc-600 pt-1 leading-snug">
              Bad batches can live on L1 until a challenger wins the dispute game.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-emerald-400">ZK Rollup</p>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span className="text-zinc-500">Batches</span>
              <span className="font-mono text-zinc-300">{zkBatches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Verified</span>
              <span className="font-mono text-emerald-400">{zkAccepted}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Rejected</span>
              <span className="font-mono text-red-400">{zkRejected}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-zinc-500">Challenge window</span>
              <span className="font-mono text-emerald-400">0 blocks</span>
            </div>
            <p className="text-[10px] text-zinc-600 pt-1 leading-snug">
              Invalid proofs fail at submit — fraudulent state never finalizes. No
              bisection or bond required.
            </p>
          </div>
        </div>
      </div>

      <div className="border-t border-zinc-800 pt-2">
        <div className="flex gap-3 text-xs">
          <span className="text-zinc-500">OP detection rate</span>
          <span className="font-mono text-emerald-400">{detectionRate}%</span>
        </div>
      </div>
    </div>
  );
}
