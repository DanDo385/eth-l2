"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { HOW_IT_WORKS_STEPS } from "../data/batchEducation";
import type { LabMode } from "./LabFrame";

const ZK_STEPS = [
  {
    n: "1",
    title: "Execute the same L2 traffic",
    body: "Trades produce a new claimed L2 state root, but L1 will not accept it on trust.",
    color: "text-blue-300",
    border: "border-blue-900/70",
  },
  {
    n: "2",
    title: "Generate a validity proof",
    body: "The prover commits to witness inputs and proof data for the claimed state transition.",
    color: "text-emerald-300",
    border: "border-emerald-900/70",
  },
  {
    n: "3",
    title: "Verify before settlement",
    body: "The verifier contract accepts valid proofs and rejects invalid claims before bridge finality advances.",
    color: "text-violet-300",
    border: "border-violet-900/70",
  },
];

export function WelcomeBanner({ mode = "optimistic" }: { mode?: LabMode }) {
  const [open, setOpen] = useState(true);
  const isZk = mode === "zk";
  const steps = isZk ? ZK_STEPS : HOW_IT_WORKS_STEPS;

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
                {isZk
                  ? "A live simulation of ZK rollup settlement. Pick a demo below, then inspect how verifier checks gate finality."
                  : "A live simulation of an Ethereum L2 rollup. Pick a demo below, then watch fraud get caught in real time."}
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
            {steps.map((s) => (
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
            {isZk
              ? "Invalid proofs are rejected by the L1 verifier in this teaching model. Click a demo card to start."
              : "Fraud is frequent enough for a short recording: usually 1-2 challenges in 60s and 3-4 in 120s. The system is designed to make cheating economically irrational, not just technically detectable. Click a demo card to start."}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
