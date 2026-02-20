"use client";

import { motion } from "framer-motion";

export function BatchCompaction() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.4 }}
      className="rounded-xl border border-cyan-500/20 bg-zinc-900/60 p-4"
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Compaction Flow</p>
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          {[1, 2, 3, 4, 5].map((n) => (
            <motion.div
              key={n}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.5 + n * 0.05 }}
              className="h-8 w-8 rounded bg-cyan-500/30 flex items-center justify-center text-xs"
            >
              TX
            </motion.div>
          ))}
          <span className="text-zinc-600">…</span>
          <span className="text-xs text-zinc-500">~1000 trades</span>
        </div>
        <div className="flex items-center gap-2 text-zinc-500">
          <span>↓</span>
          <span className="text-xs">hash chain → state root</span>
        </div>
        <div className="flex items-center gap-2">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: 0.8, duration: 0.3 }}
            className="flex-1 h-10 rounded bg-amber-500/30 flex items-center justify-center text-sm font-mono text-amber-300"
          >
            0x7f3a...b2e1
          </motion.div>
          <span className="text-xs text-zinc-500">32 bytes</span>
        </div>
        <p className="text-xs text-zinc-500">
          One state root posted to L1 instead of 1000 individual txs.
        </p>
      </div>
    </motion.div>
  );
}
