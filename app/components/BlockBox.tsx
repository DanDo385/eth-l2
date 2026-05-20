"use client";

import { motion } from "framer-motion";
import type { BatchInfo } from "../types";

interface Props {
  blockNum: number;
  batch?: BatchInfo;
  onClick?: () => void;
}

function statusColor(batch?: BatchInfo): string {
  if (!batch) return "bg-zinc-800 border-zinc-700";
  if (batch.resolved) return "bg-red-900/60 border-red-500";
  if (batch.challenged) return "bg-orange-900/60 border-orange-500";
  if (batch.flagged) return "bg-yellow-900/60 border-yellow-500";
  return "bg-blue-900/60 border-blue-500";
}

function statusLabel(batch?: BatchInfo): string {
  if (!batch) return "";
  if (batch.resolved) return "✗";
  if (batch.challenged) return "⚡";
  if (batch.flagged) return "⚠";
  return batch.engineType === "honest" ? "✓" : "~";
}

export function BlockBox({ blockNum, batch, onClick }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2 }}
      onClick={onClick}
      title={batch ? `Batch ${batch.batchId} (${batch.engineType})` : `Block ${blockNum}`}
      className={`
        relative w-10 h-10 rounded border flex flex-col items-center justify-center
        text-[9px] font-mono leading-tight select-none shrink-0
        ${statusColor(batch)}
        ${onClick ? "cursor-pointer hover:brightness-125" : ""}
      `}
    >
      <span className="text-zinc-400">{blockNum}</span>
      {batch && (
        <span
          className={`text-[10px] font-bold ${
            batch.resolved
              ? "text-red-400"
              : batch.challenged
                ? "text-orange-400"
                : batch.flagged
                  ? "text-yellow-400"
                  : "text-blue-400"
          }`}
        >
          {statusLabel(batch)}
        </span>
      )}
    </motion.div>
  );
}
