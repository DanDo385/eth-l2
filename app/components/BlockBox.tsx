"use client";

import { motion } from "framer-motion";
import type { BatchInfo } from "../types";
import { batchStatus } from "../data/batchEducation";

interface Props {
  blockNum: number;
  batch?: BatchInfo;
  onClick?: () => void;
  dimmed?: boolean;
}

function statusColor(batch?: BatchInfo): string {
  if (!batch) return "bg-zinc-800 border-zinc-700";
  const s = batchStatus(batch);
  return `${s.bg} ${s.border}`;
}

function statusLabel(batch?: BatchInfo): string {
  if (!batch) return "";
  return batchStatus(batch).short;
}

export function BlockBox({ blockNum, batch, onClick, dimmed }: Props) {
  const status = batch ? batchStatus(batch) : null;
  const title = batch
    ? `Batch #${batch.batchId} — ${status?.label}\n${status?.explanation}`
    : `Block ${blockNum}`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: dimmed ? 0.25 : 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      title={title}
      className={`
        relative w-10 h-10 rounded border flex flex-col items-center justify-center
        text-[9px] font-mono leading-tight select-none shrink-0
        ${statusColor(batch)}
        ${onClick && !dimmed ? "cursor-pointer hover:brightness-125" : ""}
        ${dimmed ? "pointer-events-none" : ""}
      `}
    >
      <span className="text-zinc-400">{blockNum}</span>
      {batch && (
        <span className="text-[10px] font-bold text-zinc-300">{statusLabel(batch)}</span>
      )}
    </motion.div>
  );
}

