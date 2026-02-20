"use client";

import { motion } from "framer-motion";

const STEPS = [
  { label: "Sequencer posts batch", role: "sequencer" },
  { label: "Challenger disputes", role: "challenger" },
  { label: "Bisection (alternating)", role: "both" },
  { label: "Resolution → Invalid", role: "challenger" },
];

export function ChallengeFlow() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ delay: 0.5 }}
      className="rounded-xl border border-amber-500/20 bg-zinc-900/60 p-4"
    >
      <p className="text-xs uppercase tracking-wider text-zinc-500 mb-3">Challenge Mechanics</p>
      <div className="space-y-2">
        {STEPS.map((s, i) => (
          <motion.div
            key={i}
            initial={{ x: -20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.6 + i * 0.1 }}
            className="flex items-center gap-3"
          >
            <div
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-bold ${
                s.role === "sequencer"
                  ? "bg-cyan-500/30 text-cyan-400"
                  : s.role === "challenger"
                    ? "bg-amber-500/30 text-amber-400"
                    : "bg-zinc-600 text-zinc-400"
              }`}
            >
              {i + 1}
            </div>
            <span className="text-sm text-zinc-400">{s.label}</span>
          </motion.div>
        ))}
      </div>
      <p className="text-xs text-zinc-500 mt-3">
        Invalid batch → challenger wins → batch rolled back.
      </p>
    </motion.div>
  );
}
