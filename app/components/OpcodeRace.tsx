"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DisputeResolvedPayload, FilteredStep } from "../types";
import { opcodeLesson } from "../data/batchEducation";

function stepsMatch(a: FilteredStep, b: FilteredStep): boolean {
  if (a.op !== b.op) return false;
  const as = a.stack4 ?? [];
  const bs = b.stack4 ?? [];
  if (as.length !== bs.length) return false;
  for (let i = 0; i < as.length; i++) {
    if (as[i] !== bs[i]) return false;
  }
  const sa = a.storage ?? {};
  const sb = b.storage ?? {};
  const keys = new Set([...Object.keys(sa), ...Object.keys(sb)]);
  for (const k of keys) {
    if (sa[k] !== sb[k]) return false;
  }
  return true;
}

function opAccent(op: string): string {
  if (op === "SSTORE") return "border-violet-500 bg-violet-950/50";
  if (op === "SLOAD") return "border-blue-500 bg-blue-950/40";
  if (op.startsWith("CALL") || op === "DELEGATECALL" || op === "STATICCALL") {
    return "border-yellow-500 bg-yellow-950/30";
  }
  if (op === "REVERT") return "border-orange-600 bg-orange-950/40";
  return "border-zinc-600 bg-zinc-900/60";
}

interface CardProps {
  step: FilteredStep;
  side: "honest" | "claimed";
  match: boolean;
  isClash: boolean;
}

function OpcodeCard({ step, side, match, isClash }: CardProps) {
  const base =
    side === "honest"
      ? "border-emerald-700/60 text-emerald-100"
      : "border-red-700/60 text-red-100";

  let ring = "";
  if (isClash) ring = "ring-2 ring-red-500 shadow-red-900/50 shadow-lg";
  else if (match) ring = "ring-2 ring-emerald-500/70";

  return (
    <div className={`flex-1 min-w-0 rounded-xl border-2 p-4 ${base} ${opAccent(step.op)} ${ring}`}>
      <p className="text-[10px] uppercase tracking-widest opacity-70 mb-1">
        {side === "honest" ? "Honest replay" : "Sequencer execution"}
      </p>
      <p className="text-xl font-mono font-bold">{step.op}</p>
      {step.storage && Object.keys(step.storage).length > 0 && (
        <div className="mt-2 text-[10px] font-mono space-y-0.5 opacity-90">
          {Object.entries(step.storage).slice(0, 2).map(([slot, val]) => (
            <div key={slot} className="truncate">
              <span className="text-zinc-500">slot </span>
              {slot.slice(0, 10)}… = {val.slice(0, 14)}…
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface Props {
  data: DisputeResolvedPayload;
  onClose: () => void;
}

export function OpcodeRace({ data, onClose }: Props) {
  const { batchId, divergenceIdx, honestSteps, claimedSteps, op, slot, honestVal, claimedVal } =
    data;
  const totalSteps = Math.min(honestSteps.length, claimedSteps.length);
  const lastStep = Math.max(0, totalSteps - 1);
  const [step, setStep] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);

  useEffect(() => {
    setStep(0);
    setShowVerdict(false);
  }, [batchId]);

  const honest = honestSteps[step];
  const claimed = claimedSteps[step];
  const matched = honest && claimed ? stepsMatch(honest, claimed) : false;
  const isClash = step === divergenceIdx && !matched;
  const atEnd = step >= divergenceIdx;

  function goNext() {
    if (step < lastStep) {
      const next = step + 1;
      setStep(next);
      if (next >= divergenceIdx && !stepsMatch(honestSteps[next], claimedSteps[next])) {
        setShowVerdict(true);
      }
    } else if (isClash || step === divergenceIdx) {
      setShowVerdict(true);
    }
  }

  function goPrev() {
    if (step > 0) {
      setStep(step - 1);
      setShowVerdict(false);
    }
  }

  function jumpToClash() {
    setStep(divergenceIdx);
    setShowVerdict(true);
  }

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
        className="bg-zinc-950 border border-zinc-700 rounded-2xl w-full max-w-3xl p-6 space-y-4 shadow-2xl max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-zinc-100">Opcode proof — Batch #{batchId}</h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Bisection narrowed the dispute to a single instruction. Use the step buttons to
              compare honest replay vs what the sequencer executed — click each round yourself.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close opcode proof"
            className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {/* Clickable step timeline */}
        <div className="flex flex-wrap gap-1">
          {honestSteps.map((s, i) => {
            const agree =
              claimedSteps[i] && stepsMatch(s, claimedSteps[i] as FilteredStep);
            const active = i === step;
            const clash = i === divergenceIdx && !agree;
            return (
              <button
                key={i}
                type="button"
                onClick={() => {
                  setStep(i);
                  setShowVerdict(i >= divergenceIdx && clash);
                }}
                className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors ${
                  active
                    ? "border-zinc-300 bg-zinc-800 text-zinc-100"
                    : clash
                      ? "border-red-700 bg-red-950/50 text-red-300"
                      : agree
                        ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                        : "border-zinc-700 bg-zinc-900 text-zinc-500"
                }`}
              >
                #{i} {s.op}
                {agree ? " ✓" : clash ? " ✗" : ""}
              </button>
            );
          })}
        </div>

        {honest && claimed ? (
          <>
            <div className="flex items-stretch gap-3">
              <OpcodeCard step={honest} side="honest" match={matched} isClash={isClash} />
              <div className="flex flex-col items-center justify-center px-1 shrink-0 min-w-[2.5rem]">
                <span className="text-[10px] uppercase tracking-widest text-zinc-600">vs</span>
                {matched ? (
                  <span className="text-xs text-emerald-400 font-semibold mt-1">match</span>
                ) : (
                  <span className="text-xs text-red-400 font-bold mt-1">clash</span>
                )}
              </div>
              <OpcodeCard step={claimed} side="claimed" match={matched} isClash={isClash} />
            </div>

            <p className="text-xs text-zinc-400 bg-zinc-900/60 border border-zinc-800 rounded-lg p-3 leading-relaxed">
              {opcodeLesson(honest.op)}
            </p>
          </>
        ) : (
          <p className="text-sm text-zinc-500 text-center py-8">
            No opcode steps available for this batch.
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="text-xs text-zinc-500 font-mono">
            Step {step + 1} of {totalSteps || 1}
            {atEnd && isClash && (
              <span className="ml-2 text-red-400 font-semibold">
                — diverged at #{divergenceIdx}
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={goPrev}
              disabled={step === 0}
              className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300 disabled:opacity-40"
            >
              ← Prev
            </button>
            <button
              type="button"
              onClick={jumpToClash}
              className="px-3 py-1.5 text-xs rounded border border-red-800 text-red-300 hover:bg-red-950/40"
            >
              Jump to clash
            </button>
            <button
              type="button"
              onClick={goNext}
              disabled={step >= lastStep && !isClash}
              className="px-3 py-1.5 text-xs rounded border border-emerald-800 text-emerald-300 disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        </div>

        <AnimatePresence>
          {showVerdict && isClash && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="rounded-xl border border-red-700 bg-red-950/30 p-4 space-y-3"
            >
              <p className="text-sm font-semibold text-red-300">
                Fraud proof wins — invalid state transition at{" "}
                <span className="font-mono">{op}</span>
              </p>
              <p className="text-xs text-zinc-400 leading-relaxed">
                The sequencer&apos;s batch claimed a post-state root covering blocks in this window.
                Honest replay through the verified engine disagrees at step #{divergenceIdx}, so
                the L1 dispute game resolves against the sequencer and the entire batch is rejected
                — not just one block.
              </p>
              {(slot || honestVal || claimedVal) && (
                <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs font-mono border-t border-red-900/50 pt-3">
                  {slot && (
                    <>
                      <span className="text-zinc-500">Storage slot</span>
                      <span className="text-zinc-300 break-all">{slot}</span>
                    </>
                  )}
                  {honestVal && (
                    <>
                      <span className="text-emerald-400">Honest value</span>
                      <span className="text-emerald-300 break-all">{honestVal}</span>
                    </>
                  )}
                  {claimedVal && (
                    <>
                      <span className="text-red-400">Claimed value</span>
                      <span className="text-red-300 break-all">{claimedVal}</span>
                    </>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
