"use client";

import { motion } from "framer-motion";
import type { Report } from "../types";

interface L2ZKProps {
  report: Report | null;
}

export function L2ZK({ report }: L2ZKProps) {
  const engine = report?.addresses?.zkL2?.tradeEngine ?? "0x...";
  const zkRollup = report?.addresses?.l1?.zkRollup ?? "0x...";

  return (
    <motion.section
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.5 }}
      className="rounded-2xl border border-violet-500/30 bg-gradient-to-b from-violet-950/40 to-zinc-900/80 p-6 shadow-xl"
    >
      <div className="flex items-center gap-3 pb-4">
        <div className="h-10 w-10 rounded-lg bg-violet-500/20 flex items-center justify-center">
          <span className="text-lg">◈</span>
        </div>
        <div>
          <h2 className="text-xl font-bold text-violet-400">L2 ZK</h2>
          <p className="text-xs text-zinc-500">Trades → Proof → L1 verification</p>
        </div>
      </div>

      <p className="text-xs text-zinc-400 mb-4">
        TradeEngine: <span className="font-mono text-violet-300">{engine}</span>
      </p>

      <div className="space-y-3 mb-4">
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Proof</p>
          <p className="font-mono text-xs text-violet-300">0x7a3f...9e2b</p>
          <p className="text-xs text-zinc-500 mt-1">ZK-SNARK · Validity proof</p>
        </div>
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">Block</p>
          <p className="font-mono text-sm text-violet-300">#142</p>
          <p className="text-xs text-zinc-500 mt-1">L2 block containing batch</p>
        </div>
        <div className="rounded-lg border border-violet-500/30 bg-violet-950/20 p-3">
          <p className="text-xs uppercase tracking-wider text-zinc-500 mb-1">ZkRollup (L1)</p>
          <p className="font-mono text-xs text-violet-300 truncate" title={zkRollup}>{zkRollup}</p>
          <p className="text-xs text-zinc-500 mt-1">Verifies proof, updates state</p>
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        No challenge window. Proof proves validity before L1 inclusion.
      </p>
    </motion.section>
  );
}
