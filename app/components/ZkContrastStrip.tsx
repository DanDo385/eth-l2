"use client";

import { useAppStore } from "../lib/store";
import {
  OP_VS_ZK_ROWS,
  ZK_PIPELINE_BEATS,
} from "../data/zkEducation";

export function ZkContrastStrip() {
  const { state, dispatch } = useAppStore();
  const latest = Object.values(state.zkRollups).sort(
    (a, b) => b.batchId - a.batchId,
  )[0];

  return (
    <div className="border-t border-zinc-800 pt-3 space-y-3">
      <div>
        <p className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wide">
          ZK in three beats
        </p>
        <p className="text-[10px] text-zinc-600 mt-0.5 leading-snug">
          Same batch window as OP, opposite trust model, validity is proved, not assumed.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {ZK_PIPELINE_BEATS.map((beat) => (
          <div
            key={beat.label}
            className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-2 py-2 text-center"
          >
            <p className="text-sm font-bold text-emerald-400">{beat.num}</p>
            <p className="text-[10px] font-semibold text-zinc-200">{beat.label}</p>
            <p className="text-[9px] text-zinc-500 mt-0.5 leading-snug">{beat.hint}</p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-zinc-800 overflow-hidden text-[10px]">
        <div className="grid grid-cols-[4.5rem_1fr_1fr] bg-zinc-950/80 px-2 py-1 text-zinc-500 font-medium">
          <span />
          <span className="text-blue-400">Optimistic</span>
          <span className="text-emerald-400">ZK</span>
        </div>
        {OP_VS_ZK_ROWS.map((row) => (
          <div
            key={row.topic}
            className="grid grid-cols-[4.5rem_1fr_1fr] gap-x-2 px-2 py-1.5 border-t border-zinc-800/80 text-zinc-400 leading-snug"
          >
            <span className="text-zinc-500 font-medium">{row.topic}</span>
            <span>{row.optimistic}</span>
            <span>{row.zk}</span>
          </div>
        ))}
      </div>

      {latest ? (
        <button
          type="button"
          onClick={() => {
            dispatch({ type: "SHOW_ZK_INSPECT", batchId: latest.batchId });
            dispatch({ type: "MARK_EXPLORED", lane: "zk", batchId: latest.batchId });
          }}
          className="w-full text-[11px] py-2 rounded-lg border border-emerald-800 text-emerald-300 hover:bg-emerald-950/30"
        >
          Walk ZK concept tour: Batch #{latest.batchId}
          {latest.accepted ? " (verified)" : " (rejected)"}
        </button>
      ) : (
        <p className="text-[10px] text-zinc-600 italic text-center">
          Start the demo, a live ZK batch tour appears here.
        </p>
      )}
    </div>
  );
}
