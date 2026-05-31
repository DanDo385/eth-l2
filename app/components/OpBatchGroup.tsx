"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { BatchInfo } from "../types";
import { batchStatus, engineExplanation } from "../data/batchEducation";

interface Props {
  batch: BatchInfo;
  blockNums: number[];
  dimmed?: boolean;
  selected?: boolean;
  onClick: () => void;
}

export function OpBatchGroup({ batch, blockNums, dimmed, selected, onClick }: Props) {
  const [showFraud, setShowFraud] = useState(false);
  const prevResolved = useRef(false);
  const status = batchStatus(batch);

  useEffect(() => {
    const resolvedNow = batch.resolved;
    if (resolvedNow && !prevResolved.current) {
      setShowFraud(true);
      const t = setTimeout(() => setShowFraud(false), 2400);
      prevResolved.current = true;
      return () => clearTimeout(t);
    }
    prevResolved.current = resolvedNow;
  }, [batch.resolved]);

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
        <span className="text-[10px] font-semibold text-zinc-200">Batch #{batch.batchId}</span>
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

      <p className="text-[9px] leading-snug text-zinc-400 line-clamp-3">{status.explanation}</p>
      <p className="text-[8px] mt-1 text-zinc-500 italic line-clamp-2">
        {engineExplanation(batch.engineType)}
      </p>

      <AnimatePresence>
        {showFraud && (
          <motion.div
            initial={{ opacity: 0, scale: 0.5 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 flex items-center justify-center bg-red-600/95 rounded-md z-10"
          >
            <span className="text-xs font-black text-white tracking-wide">FRAUD PROVEN</span>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

interface PendingProps {
  blockNum: number;
}

export function OpPendingBlock({ blockNum }: PendingProps) {
  return (
    <div
      title="Swaps in this block accumulate toward the next batch. One state root will cover the whole window."
      className="w-10 h-10 rounded border border-dashed border-zinc-700 bg-zinc-900/50 flex flex-col items-center justify-center text-[9px] font-mono text-zinc-500 shrink-0"
    >
      <span>{blockNum}</span>
      <span className="text-[7px] text-zinc-600">…</span>
    </div>
  );
}
