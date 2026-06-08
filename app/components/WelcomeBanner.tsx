"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HOW_IT_WORKS_STEPS } from "../data/batchEducation";

export function WelcomeBanner() {
  const [open, setOpen] = useState(true);

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.25 }}
          className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 space-y-4"
        >
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-zinc-100">
                How this lab works
              </h2>
              <p className="text-[11px] text-zinc-500 mt-0.5 leading-relaxed">
                A live simulation of an Ethereum L2 rollup, pick a demo below to start, then watch fraud get caught in real time.
              </p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Dismiss welcome banner"
              className="text-zinc-600 hover:text-zinc-400 text-lg leading-none shrink-0 mt-0.5"
            >
              ×
            </button>
          </div>

          <ol className="space-y-2">
            {HOW_IT_WORKS_STEPS.map((s) => (
              <li
                key={s.n}
                className={`rounded-lg border p-3 flex gap-3 ${s.border} bg-zinc-950/50`}
              >
                <span
                  className={`text-xs font-mono font-bold w-5 shrink-0 ${s.color}`}
                >
                  {s.n}
                </span>
                <div className="min-w-0">
                  <p className={`text-xs font-semibold ${s.color}`}>{s.title}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5 leading-relaxed">
                    {s.body}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <p className="text-[11px] text-zinc-600 leading-relaxed border-t border-zinc-800 pt-3">
            Fraud is rare by design, roughly 1-in-10 batches. The system is designed to make cheating economically irrational, not just technically detectable. Click a demo card to start.
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
