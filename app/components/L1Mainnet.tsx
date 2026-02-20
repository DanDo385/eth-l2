"use client";

import { motion } from "framer-motion";
import type { Report } from "../types";

interface L1MainnetProps {
  report: Report | null;
  opBatchCount: number;
  finalizedCount: number;
}

export function L1Mainnet({ report, opBatchCount, finalizedCount }: L1MainnetProps) {
  const portal = report?.addresses?.l1?.portal ?? "0x...";
  const disputeGame = report?.addresses?.l1?.disputeGame ?? "0x...";

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="mt-8 rounded-2xl border border-amber-500/30 bg-gradient-to-b from-amber-950/40 to-zinc-900/80 p-8 shadow-2xl"
    >
      <div className="flex items-center gap-3 pb-6">
        <div className="h-12 w-12 rounded-xl bg-amber-500/20 flex items-center justify-center">
          <span className="text-2xl">◆</span>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-amber-400">L1 · Ethereum Mainnet</h2>
          <p className="text-sm text-zinc-500">Batch roots · State commitments · Dispute resolution</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Optimistic Portal</p>
          <p className="font-mono text-sm text-amber-300 truncate" title={portal}>{portal}</p>
          <p className="text-xs text-zinc-500 mt-2">Posts batches, accepts challenges</p>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Dispute Game</p>
          <p className="font-mono text-sm text-amber-300 truncate" title={disputeGame}>{disputeGame}</p>
          <p className="text-xs text-zinc-500 mt-2">Bisection · Challenger wins invalid batches</p>
        </div>
        <div className="rounded-xl bg-zinc-900/60 border border-zinc-700/50 p-4">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Batches</p>
          <p className="text-2xl font-bold text-amber-400">{opBatchCount}</p>
          <p className="text-xs text-zinc-500 mt-2">{finalizedCount} finalized on L1</p>
        </div>
      </div>

      <div className="rounded-xl bg-zinc-900/40 border border-zinc-700/40 p-4">
        <p className="text-xs uppercase tracking-wider text-zinc-500 mb-2">L1 State</p>
        <p className="text-sm text-zinc-400">
          Only the <span className="text-amber-400 font-medium">state root</span> of each batch is posted to L1—not individual transactions.
          Thousands of L2 trades compact into a single 32-byte commitment. Challenges trigger bisection disputes; invalid batches are rolled back.
        </p>
      </div>
    </motion.section>
  );
}
