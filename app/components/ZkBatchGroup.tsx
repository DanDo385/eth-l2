"use client";

import { motion } from "framer-motion";
import type { ZkInspectPayload } from "../types";
import { zkBatchStatus } from "../data/zkEducation";

function shortHash(h: string) {
  return h.length > 14 ? h.slice(0, 8) + "…" + h.slice(-4) : h;
}

interface Props {
  rollup: ZkInspectPayload;
  blockNums: number[];
  dimmed?: boolean;
  selected?: boolean;
  onClick: () => void;
}

export function ZkBatchGroup({ rollup, blockNums, dimmed, selected, onClick }: Props) {
  const status = zkBatchStatus(rollup);

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: dimmed ? 0.45 : 1, y: 0 }}
      onClick={onClick}
      title={status.explanation}
      className={`
        relative text-left rounded-lg border-2 p-2 min-w-[11rem] max-w-[14rem] shrink-0
        transition-all ${status.border} ${status.bg}
        cursor-pointer hover:brightness-110
        ${selected ? "ring-2 ring-zinc-300 ring-offset-2 ring-offset-zinc-950 opacity-100" : ""}
      `}
    >
      <div className="flex items-center justify-between gap-1 mb-1">
        <span className="text-[10px] font-semibold text-zinc-200">Batch #{rollup.batchId}</span>
        <span className="text-[10px] font-bold text-zinc-300">{status.short}</span>
      </div>

      <div className="flex gap-0.5 mb-1.5">
        {blockNums.map((n) => (
          <span
            key={n}
            className="flex-1 min-w-0 h-7 rounded bg-black/30 border border-zinc-700/80 flex items-center justify-center text-[9px] font-mono text-zinc-400"
          >
            {n}
          </span>
        ))}
      </div>

      <p className="text-[9px] leading-snug text-zinc-400 line-clamp-2">{status.explanation}</p>
      <p className="text-[8px] mt-1 font-mono text-zinc-500 truncate" title={rollup.claimedPostRoot}>
        claim {rollup.claimedPostRoot ? shortHash(rollup.claimedPostRoot) : "pending"}
      </p>
      {rollup.txCount != null && rollup.txCount > 0 && (
        <p className="text-[8px] text-zinc-600">{rollup.txCount} swap{rollup.txCount === 1 ? "" : "s"}</p>
      )}
    </motion.button>
  );
}

export function ZkPendingBlock({ blockNum }: { blockNum: number }) {
  return (
    <div
      title="Swaps in this block accumulate toward the next ZK proof batch."
      className="w-10 h-10 rounded border border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center text-[9px] font-mono text-zinc-500 shrink-0"
    >
      <span>{blockNum}</span>
      <span className="text-[7px] text-zinc-600">…</span>
    </div>
  );
}
