"use client";

import { motion } from "framer-motion";
import type { Layer3Trade } from "../types";

interface TransactionFlowProps {
  trades: Layer3Trade[];
}

export function TransactionFlow({ trades }: TransactionFlowProps) {
  return (
    <motion.section
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5, delay: 0.3 }}
      className="rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-emerald-950/40 to-zinc-900/80 p-6 shadow-xl"
    >
      <div className="flex items-center gap-3 pb-4">
        <div className="h-10 w-10 rounded-lg bg-emerald-500/20 flex items-center justify-center font-bold text-emerald-400">
          L3
        </div>
        <div>
          <h2 className="text-xl font-bold text-emerald-400">Layer3 Token Trades</h2>
          <p className="text-xs text-zinc-500">ERC20-style · simulated for illustration</p>
        </div>
      </div>

      <div className="space-y-2">
        {trades.map((t, i) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 * i }}
            className={`flex items-center justify-between rounded-lg border px-4 py-2 ${
              t.status === "invalidated"
                ? "border-red-500/40 bg-red-950/20"
                : "border-emerald-500/30 bg-emerald-950/20"
            }`}
          >
            <div>
              <span className="font-mono text-sm text-emerald-300">
                {t.amountIn} → {t.amountOut}
              </span>
              <span className="text-xs text-zinc-500 ml-2">{t.trader}</span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  t.chain === "op" ? "bg-cyan-500/20 text-cyan-400" : "bg-violet-500/20 text-violet-400"
                }`}
              >
                {t.chain.toUpperCase()}
              </span>
              <span
                className={`text-xs px-2 py-0.5 rounded ${
                  t.status === "invalidated"
                    ? "bg-red-500/30 text-red-400"
                    : t.status === "pending" || t.status === "l2_executing" || t.status === "batched"
                      ? "bg-amber-500/20 text-amber-400"
                      : "bg-emerald-500/20 text-emerald-400"
                }`}
              >
                {t.status}
              </span>
            </div>
          </motion.div>
        ))}
      </div>
    </motion.section>
  );
}
