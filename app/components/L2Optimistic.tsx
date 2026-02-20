"use client";

import { motion } from "framer-motion";
import type { OpBatch, OpDispute } from "../types";

interface L2OptimisticProps {
  batches: OpBatch[];
  disputes: OpDispute[];
  report: { addresses?: { opL2?: { tradeEngine: string } } } | null;
}

export function L2Optimistic({ batches, disputes, report }: L2OptimisticProps) {
  const engine = report?.addresses?.opL2?.tradeEngine ?? "0x...";
  const dispute = disputes[0];

  return (
    <motion.section
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-cyan-500/30 bg-gradient-to-b from-cyan-950/40 to-zinc-900/80 p-6 shadow-xl"
    >
      <div className="flex items-center gap-3 pb-4">
        <div className="h-10 w-10 rounded-lg bg-cyan-500/20 flex items-center justify-center">
          <span className="text-lg">◎</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-cyan-400">L2 Optimistic</h2>
          <p className="text-xs text-zinc-500">Trades → Batches → L1 state root</p>
        </div>
      </div>

      <p className="text-xs text-zinc-400 mb-4">
        TradeEngine: <span className="font-mono text-cyan-300">{engine}</span>
      </p>

      <div className="space-y-3 mb-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500">Batch Flow</p>
        {batches.map((b, i) => (
          <motion.div
            key={b.batchId}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.1 }}
            className={`rounded-lg border p-3 ${
              b.isBad
                ? "border-red-500/50 bg-red-950/30"
                : "border-cyan-500/30 bg-cyan-950/20"
            }`}
          >
            <div className="flex justify-between items-start">
              <span className="font-mono text-sm text-cyan-300">Batch {b.batchId}</span>
              {b.isBad && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/30 text-red-400">
                  Challenged
                </span>
              )}
            </div>
            <p className="text-xs text-zinc-500 mt-1">{b.txCount} trades → state root</p>
            <p className="font-mono text-xs text-zinc-600 truncate mt-1" title={b.postStateRoot}>
              {b.postStateRoot.slice(0, 18)}…
            </p>
          </motion.div>
        ))}
      </div>

      {dispute && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-950/20 p-3">
          <p className="text-xs uppercase tracking-wider text-amber-500/80 mb-2">
            Dispute (Batch {dispute.batchId})
          </p>
          <p className="text-xs text-zinc-400">
            Bisection: {dispute.rounds.length} rounds ·{" "}
            <span className="text-amber-400">{dispute.result}</span>
          </p>
          <p className="text-xs text-zinc-500 mt-1">Challenger wins → batch invalidated</p>
        </div>
      )}
    </motion.section>
  );
}
