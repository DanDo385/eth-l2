"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ZkInspectPayload } from "../types";
import { safeNum } from "../lib/numbers";
import {
  OP_VS_ZK_ROWS,
  ZK_TOUR_STEPS,
  zkOneLiner,
  zkVerdictLabel,
} from "../data/zkEducation";

interface Props {
  data: ZkInspectPayload;
  onClose: () => void;
}

export function ZkInspect({ data, onClose }: Props) {
  const [step, setStep] = useState(0);
  const lastStep = ZK_TOUR_STEPS.length - 1;
  const current = ZK_TOUR_STEPS[step];
  const accepted = data.accepted;

  useEffect(() => {
    setStep(0);
  }, [data.batchId]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        className="bg-zinc-950 border border-zinc-700 rounded-2xl w-full max-w-2xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-emerald-400">ZK concept tour</h2>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Batch #{safeNum(data.batchId)} · block {safeNum(data.l2EndBlock)} ·{" "}
              <span className={accepted ? "text-emerald-400" : "text-red-400"}>
                {zkVerdictLabel(accepted)}
              </span>
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close ZK tour"
            className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        <p className="text-[11px] text-zinc-500 leading-relaxed border-l-2 border-emerald-800 pl-3">
          Three ideas that separate ZK rollups from optimistic ones. Click through at your
          pace — same rhythm as the opcode proof walkthrough.
        </p>

        {/* Step pills */}
        <div className="flex flex-wrap gap-1.5">
          {ZK_TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={`text-[10px] font-mono px-2.5 py-1 rounded-full border transition-colors ${
                i === step
                  ? "border-emerald-400 bg-emerald-950/50 text-emerald-200"
                  : i < step
                    ? "border-emerald-900 text-emerald-500"
                    : "border-zinc-700 text-zinc-500"
              }`}
            >
              {s.beat} {s.title}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, x: 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -8 }}
            className="rounded-xl border border-emerald-900/60 bg-emerald-950/20 p-4 space-y-3"
          >
            <p className="text-xs font-semibold text-emerald-300">{current.beat}</p>
            <p className="text-sm font-medium text-zinc-100">{current.concept}</p>
            <p className="text-xs text-zinc-400 leading-relaxed border-t border-emerald-900/40 pt-3">
              {current.detail(data)}
            </p>

            {current.id === "prove" && (
              <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
                <div className="rounded-lg bg-black/30 border border-violet-900/50 p-2">
                  <p className="text-zinc-500">Constraints</p>
                  <p className="font-mono text-violet-300 text-base">
                    {safeNum(data.constraints).toLocaleString()}
                  </p>
                </div>
                <div className="rounded-lg bg-black/30 border border-violet-900/50 p-2">
                  <p className="text-zinc-500">Prove time (sim)</p>
                  <p className="font-mono text-violet-300 text-base">
                    {safeNum(data.proveMs)} ms
                  </p>
                </div>
              </div>
            )}

            {current.id === "verify" && (
              <div
                className={`rounded-lg border p-3 text-xs ${
                  accepted
                    ? "border-emerald-700 bg-emerald-950/40"
                    : "border-red-700 bg-red-950/40"
                }`}
              >
                <p
                  className={`font-semibold ${accepted ? "text-emerald-300" : "text-red-300"}`}
                >
                  {zkOneLiner(data)}
                </p>
                <p className="text-zinc-400 mt-2 leading-relaxed">
                  {data.reason ??
                    (accepted
                      ? "L1 finalized this batch immediately — no challenge window."
                      : "L1 rejected the proof — this state never became canonical.")}
                </p>
                <p className="text-zinc-500 mt-2 font-mono">
                  Verify gas: {safeNum(data.verifyGas).toLocaleString()}
                </p>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {step === lastStep && (
          <div className="rounded-xl border border-zinc-700 bg-zinc-900/50 p-3 space-y-2">
            <p className="text-[10px] font-semibold text-zinc-400 uppercase tracking-wide">
              Why this lane feels different from OP
            </p>
            <div className="space-y-1.5 text-[11px]">
              {OP_VS_ZK_ROWS.map((row) => (
                <div key={row.topic} className="grid grid-cols-[5rem_1fr] gap-2">
                  <span className="text-zinc-500">{row.topic}</span>
                  <span className="text-zinc-400">
                    <span className="text-blue-400/90">OP:</span> {row.optimistic}
                    <br />
                    <span className="text-emerald-400/90">ZK:</span> {row.zk}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-xs text-zinc-500 font-mono">
            Step {step + 1} of {ZK_TOUR_STEPS.length}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-40"
            >
              ← Prev
            </button>
            {step < lastStep ? (
              <button
                type="button"
                onClick={() => setStep((s) => s + 1)}
                className="px-3 py-1.5 text-xs rounded border border-emerald-800 text-emerald-300"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={onClose}
                className="px-3 py-1.5 text-xs rounded border border-emerald-700 bg-emerald-950/40 text-emerald-200"
              >
                Done
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
