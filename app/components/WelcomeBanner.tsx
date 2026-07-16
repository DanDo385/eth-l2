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
    title: "Form public inputs",
    body: "The batch header binds previous root, claimed post root, batch data hash, and block range. These become the public inputs the proof must match.",
    color: "text-emerald-300",
    border: "border-emerald-900/70",
  },
  {
    n: "3",
    title: "Generate a validity proof",
    body: "The prover commits to witness inputs and proof data for the claimed state transition off-chain.",
    color: "text-violet-300",
    border: "border-violet-900/70",
  },
  {
    n: "4",
    title: "Verify before settlement",
    body: "The verifier contract accepts valid proofs and rejects invalid claims. This demo focuses on validity, not privacy or data availability.",
    color: "text-amber-300",
    border: "border-amber-900/70",
  },
];

export function WelcomeBanner({ mode = "optimistic" }: { mode?: LabMode }) {
  const [open, setOpen] = useState(false);
  const isZk = mode === "zk";
  const steps = isZk ? ZK_STEPS : HOW_IT_WORKS_STEPS;

  return (
    <div className="overflow-hidden rounded-xl border border-zinc-700 bg-zinc-900">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-zinc-800/40"
      >
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-zinc-100">How this lab works</h2>
          <p className="mt-0.5 text-xs leading-snug text-zinc-500">
            {isZk
              ? "Pick a demo, then inspect how verifier checks gate finality."
              : "Pick a demo, then catch a lying sequencer in real time."}
          </p>
        </div>
        <span
          aria-hidden="true"
          className={`shrink-0 text-xs text-zinc-500 transition-transform ${
            open ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-zinc-800 px-4 pb-4 pt-3">
              <ol className="space-y-2">
                {steps.map((s) => (
                  <li
                    key={s.n}
                    className={`flex gap-3 rounded-lg border bg-zinc-950/50 p-3 ${s.border}`}
                  >
                    <span
                      className={`w-5 shrink-0 font-mono text-xs font-bold ${s.color}`}
                    >
                      {s.n}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-semibold ${s.color}`}>{s.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                        {s.body}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>

              <p className="border-t border-zinc-800 pt-3 text-xs leading-relaxed text-zinc-600">
                {isZk
                  ? "Invalid proofs are rejected by the L1 verifier in this teaching model. Click a demo card to start."
                  : "A watcher flag is not a challenge - nothing is rejected until you verify locally and post a challenge bond on L1. Click a demo card to start."}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
