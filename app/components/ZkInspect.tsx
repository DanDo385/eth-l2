"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ZkInspectPayload } from "../types";
import { safeNum } from "../lib/numbers";

const STAGES = [
  { key: "commit", label: "Commit trace", durationMs: 600 },
  { key: "witness", label: "Witness generation", durationMs: 1000 },
  { key: "prove", label: "Proving", durationMs: 2000 },
  { key: "verify", label: "Verify on-chain", durationMs: 500 },
];

interface Props {
  data: ZkInspectPayload;
  onClose: () => void;
}

export function ZkInspect({ data, onClose }: Props) {
  const [stageIdx, setStageIdx] = useState(-1);
  const [constraintCount, setConstraintCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    let elapsed = 0;
    let stageStart = 0;
    let animStart = Date.now();

    const advance = (idx: number) => {
      if (idx >= STAGES.length) return;
      setStageIdx(idx);
      stageStart = Date.now();

      if (STAGES[idx].key === "prove") {
        // grow constraint counter during prove stage
        const target = safeNum(data.constraints);
        const dur = STAGES[idx].durationMs;
        const t0 = Date.now();
        const tick = setInterval(() => {
          const progress = Math.min(1, (Date.now() - t0) / dur);
          setConstraintCount(Math.floor(progress * target));
          setElapsedMs(Date.now() - animStart);
          if (progress >= 1) clearInterval(tick);
        }, 50);
      }

      setTimeout(() => {
        elapsed += STAGES[idx].durationMs;
        advance(idx + 1);
      }, STAGES[idx].durationMs);
    };

    const kickoff = setTimeout(() => advance(0), 300);
    return () => clearTimeout(kickoff);
  }, [data.constraints]);

  const done = stageIdx >= STAGES.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        exit={{ scale: 0.9 }}
        className="bg-zinc-950 border border-zinc-700 rounded-2xl w-full max-w-md p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-emerald-400">ZK Inspect</h2>
          <button
            onClick={onClose}
            aria-label="Close ZK inspect"
            className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="text-xs text-zinc-500 font-mono">
          Batch #{safeNum(data.batchId)} · block {safeNum(data.l2EndBlock)}
        </div>

        <div className="space-y-2">
          {STAGES.map((stage, i) => {
            const isActive = i === stageIdx;
            const isDone = i < stageIdx || stageIdx >= STAGES.length;
            return (
              <motion.div
                key={stage.key}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 border transition-colors ${
                  isDone
                    ? "border-emerald-700 bg-emerald-900/20"
                    : isActive
                      ? "border-emerald-500 bg-emerald-900/30"
                      : "border-zinc-800 bg-zinc-900"
                }`}
              >
                <span className="text-base">
                  {isDone ? "✓" : isActive ? "⏳" : "○"}
                </span>
                <span
                  className={`text-sm flex-1 ${
                    isDone
                      ? "text-emerald-400"
                      : isActive
                        ? "text-zinc-100"
                        : "text-zinc-600"
                  }`}
                >
                  {stage.label}
                </span>
                {isActive && stage.key === "prove" && (
                  <span className="text-xs font-mono text-violet-400">
                    {constraintCount.toLocaleString()} constraints
                  </span>
                )}
              </motion.div>
            );
          })}
        </div>

        <AnimatePresence>
          {stageIdx >= STAGES.length - 1 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-4 space-y-3 text-xs ${
                data.accepted
                  ? "border-emerald-700 bg-emerald-950/40"
                  : "border-red-700 bg-red-950/40"
              }`}
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-zinc-500">Constraints</p>
                  <p
                    className={`font-mono text-base ${
                      data.accepted ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {safeNum(data.constraints).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Prove time</p>
                  <p
                    className={`font-mono text-base ${
                      data.accepted ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {safeNum(data.proveMs)} ms
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Verify gas</p>
                  <p
                    className={`font-mono text-base ${
                      data.accepted ? "text-emerald-300" : "text-red-300"
                    }`}
                  >
                    {safeNum(data.verifyGas).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-zinc-500">Status</p>
                  <p
                    className={`font-semibold ${
                      data.accepted ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {data.accepted ? "Verified ✓" : "Rejected ✗"}
                  </p>
                </div>
              </div>
              <p className="text-[11px] text-zinc-400 leading-relaxed border-t border-zinc-800/80 pt-3">
                {data.reason ??
                  (data.accepted
                    ? "Proof verified on L1 — batch finalized immediately."
                    : "Invalid proof — this batch was rejected and never finalized.")}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
