"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { ZkInspectPayload } from "../types";
import { safeNum } from "../lib/numbers";
import {
  OP_VS_ZK_ROWS,
  ZK_DA_CAVEAT,
  ZK_TOUR_STEPS,
  ZK_VALIDITY_CAVEAT,
  zkOneLiner,
  zkVerdictLabel,
} from "../data/zkEducation";

function shortHash(h?: string) {
  if (!h) return "-";
  return h.length > 14 ? h.slice(0, 10) + "…" + h.slice(-4) : h;
}

interface Props {
  data: ZkInspectPayload;
  onClose: () => void;
}

// Human labels for the claim the sequencer posted (fraud vs honest-intent bug).
const CLAIM_LABEL: Record<string, string> = {
  obvious: "obvious lie (2x output)",
  subtle: "subtle lie (skipped fee)",
  buggy: "honest-intent bug (truncated)",
};

export function ZkInspect({ data, onClose }: Props) {
  const [step, setStep] = useState(0);
  const lastStep = ZK_TOUR_STEPS.length - 1;
  const current = ZK_TOUR_STEPS[step];
  const accepted = data.accepted;

  useEffect(() => {
    setStep(0);
  }, [data.batchId]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/85 p-2 sm:p-4"
    >
      <motion.div
        initial={{ scale: 0.92, y: 12 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.92, y: 12 }}
        className="bg-zinc-950 border border-zinc-700 rounded-t-2xl sm:rounded-2xl w-full max-w-2xl p-4 sm:p-6 space-y-4 shadow-2xl max-h-[92vh] sm:max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-emerald-400">ZK concept tour</h2>
            <p className="text-xs text-zinc-500 mt-1 font-mono">
              Batch #{safeNum(data.batchId)} · blocks {safeNum(data.l2StartBlock)}→{safeNum(data.l2EndBlock)}
              {data.txCount != null && data.txCount > 0 ? ` · ${data.txCount} swap${data.txCount === 1 ? "" : "s"}` : ""}
              {" · "}
              <span className={accepted ? "text-emerald-400" : "text-red-400"}>
                {zkVerdictLabel(accepted)}
              </span>
              {data.engineType && data.engineType !== "honest" && (
                <span className="ml-1 text-red-300">
                  · claim: {CLAIM_LABEL[data.engineType]}
                </span>
              )}
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

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-3 space-y-2">
          <p className="text-xs font-semibold text-zinc-300 uppercase tracking-wide">
            Public inputs and L1 commitments
          </p>
          <p className="text-xs text-zinc-500 leading-relaxed">
            Public inputs bind the proof to visible commitments. If any value changes, the proof no longer verifies.
          </p>
          <div className="grid gap-2 sm:grid-cols-2 text-xs">
            <div>
              <p className="text-zinc-500">Header hash</p>
              <p className="font-mono text-zinc-300 break-all">{shortHash(data.headerHash)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Batch data hash</p>
              <p className="font-mono text-zinc-300 break-all">{shortHash(data.batchDataHash)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Previous root</p>
              <p className="font-mono text-zinc-300 break-all">{shortHash(data.prevStateRoot)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Claimed post root</p>
              <p className="font-mono text-zinc-300 break-all">{shortHash(data.claimedPostRoot)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Recomputed honest root</p>
              <p className="font-mono text-zinc-300 break-all">{shortHash(data.recomputedRoot)}</p>
            </div>
            <div>
              <p className="text-zinc-500">Witness accounts (demo)</p>
              <p className="font-mono text-zinc-300">{data.witnessAccounts ?? "-"}</p>
            </div>
          </div>
        </div>

        <div className="rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2 space-y-1">
          <p className="text-xs font-semibold text-amber-300">What this demo does not model</p>
          <p className="text-xs text-zinc-500 leading-relaxed">{ZK_VALIDITY_CAVEAT}</p>
          <p className="text-xs text-zinc-600 leading-relaxed">{ZK_DA_CAVEAT}</p>
        </div>

        <p className="text-xs text-zinc-500 leading-relaxed border-l-2 border-emerald-800 pl-3">
          Three ideas that separate ZK rollups from optimistic ones. Click through at your
          pace, same rhythm as the opcode proof walkthrough.
        </p>

        {/* Step pills */}
        <div className="flex flex-wrap gap-1.5">
          {ZK_TOUR_STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setStep(i)}
              className={`text-xs font-mono px-2.5 py-1 rounded-full border transition-colors ${
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

            <div className="rounded-lg bg-black/30 border border-emerald-900/40 p-3">
              <p className="text-xs uppercase tracking-widest text-emerald-500/80 mb-1">
                From first principles
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">{current.deepDive}</p>
            </div>

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
                      ? "In this simplified model, L1 accepts the new root as soon as the verifier succeeds."
                      : "L1 rejected the claim; the canonical root did not move.")}
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
            <p className="text-xs font-semibold text-zinc-400 uppercase tracking-wide">
              Why this lane feels different from OP
            </p>
            <div className="space-y-1.5 text-xs">
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
