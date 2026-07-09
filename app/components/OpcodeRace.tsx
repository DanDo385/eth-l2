"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DisputeResolvedPayload, FilteredStep } from "../types";
import { useAppStore } from "../lib/store";
import {
  decodeWord,
  describeStep,
  explainDivergence,
  filteringSummary,
  opHeadline,
  shortHex,
  slotMeaning,
  TWO_COLUMNS_NOTE,
  type EngineType,
} from "../data/traceNarrative";
import { EngineSourceCompare } from "./EngineSourceCompare";

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
  engineType?: EngineType;
}

function OpcodeCard({ step, side, match, isClash, engineType }: CardProps) {
  const base =
    side === "honest"
      ? "border-emerald-700/60 text-emerald-100"
      : "border-red-700/60 text-red-100";

  let ring = "";
  if (isClash) ring = "ring-2 ring-red-500 shadow-red-900/50 shadow-lg";
  else if (match) ring = "ring-2 ring-emerald-500/70";

  const entries = step.storage ? Object.entries(step.storage) : [];

  return (
    <div className={`flex-1 min-w-0 rounded-xl border-2 p-4 ${base} ${opAccent(step.op)} ${ring}`}>
      <p className="text-[10px] uppercase tracking-widest opacity-70 mb-1">
        {side === "honest" ? "Honest replay" : "Sequencer execution"}
      </p>
      <p className="text-xl font-mono font-bold">{step.op}</p>
      <p className="text-[11px] opacity-80 mt-0.5">{opHeadline(step.op)}</p>
      {entries.length > 0 && (
        <div className="mt-2 text-[10px] font-mono space-y-1 opacity-90">
          {entries.slice(0, 2).map(([slot, val]) => {
            const m = slotMeaning(slot, engineType);
            const d = decodeWord(val);
            return (
              <div key={slot} className="space-y-0.5">
                <div className="text-zinc-500">{m.label}</div>
                <div className="truncate">
                  = <span className="text-zinc-200">{d.display}</span>
                  {d.kind === "number" && (
                    <span className="text-zinc-600"> ({shortHex(val)})</span>
                  )}
                </div>
              </div>
            );
          })}
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
  const {
    batchId,
    divergenceIdx,
    honestSteps,
    claimedSteps,
    op,
    slot,
    honestVal,
    claimedVal,
    rawHonestLen,
    lyingSource,
    honestSource,
    onchainDivergenceStep,
  } = data;

  // Pull the batch's engine type from the store so the narration can name the
  // exact lie (subtle fee-skip vs. obvious wrong amount).
  const { state } = useAppStore();
  const engineType = state.batches[batchId]?.engineType as EngineType | undefined;

  const totalSteps = Math.min(honestSteps.length, claimedSteps.length);
  const lastStep = Math.max(0, totalSteps - 1);

  // view: the intro chapter explains the setup before stepping through opcodes.
  const [view, setView] = useState<"intro" | "trace">("intro");
  const [step, setStep] = useState(0);
  const [showVerdict, setShowVerdict] = useState(false);

  useEffect(() => {
    setView("intro");
    setStep(0);
    setShowVerdict(false);
  }, [batchId, divergenceIdx]);

  const honest = honestSteps[step];
  const claimed = claimedSteps[step];
  const matched = honest && claimed ? stepsMatch(honest, claimed) : false;
  const isClash = step === divergenceIdx && !matched;
  const isDownstream = step > divergenceIdx && !matched;
  const atEnd = step >= divergenceIdx;

  const divergence = useMemo(
    () => explainDivergence(op, slot, honestVal, claimedVal, engineType),
    [op, slot, honestVal, claimedVal, engineType],
  );

  function enterTrace(at: number) {
    setView("trace");
    setStep(at);
    setShowVerdict(at === divergenceIdx);
  }

  function goNext() {
    if (step < lastStep) {
      const next = step + 1;
      setStep(next);
      setShowVerdict(next === divergenceIdx);
    }
  }

  function goPrev() {
    if (step > 0) {
      setStep(step - 1);
      setShowVerdict(false);
    } else {
      setView("intro");
    }
  }

  function jumpToClash() {
    setView("trace");
    setStep(divergenceIdx);
    setShowVerdict(true);
  }

  const matchCount = useMemo(() => {
    let n = 0;
    for (let i = 0; i < divergenceIdx && i < totalSteps; i++) {
      if (stepsMatch(honestSteps[i], claimedSteps[i])) n++;
    }
    return n;
  }, [honestSteps, claimedSteps, divergenceIdx, totalSteps]);

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
            <h2 className="text-lg font-bold text-zinc-100">Fraud proof: Batch #{batchId}</h2>
            <p className="text-xs text-zinc-500 mt-1 leading-relaxed">
              Walk the proof from first principles: what the swap engine did, step by
              step, and the single instruction where the sequencer&apos;s version and an
              honest re-run disagree.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close fraud proof"
            className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none shrink-0"
          >
            ×
          </button>
        </div>

        {view === "intro" ? (
          /* ── Chapter 0: what this proof is ─────────────────────────────── */
          <div className="space-y-4">
            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-3">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                ① Why so few steps?
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">
                {filteringSummary(rawHonestLen, totalSteps)}
              </p>
              {rawHonestLen ? (
                <div className="flex items-center gap-3 text-center">
                  <div className="flex-1 rounded-lg bg-black/40 border border-zinc-800 p-2">
                    <p className="text-lg font-mono text-zinc-200">
                      {rawHonestLen.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-zinc-500">instructions executed</p>
                  </div>
                  <span className="text-zinc-600 text-lg">→</span>
                  <div className="flex-1 rounded-lg bg-black/40 border border-blue-900/60 p-2">
                    <p className="text-lg font-mono text-blue-300">{totalSteps}</p>
                    <p className="text-[10px] text-zinc-500">state-touching steps</p>
                  </div>
                </div>
              ) : null}
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                ② Two columns
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">{TWO_COLUMNS_NOTE}</p>
            </div>

            <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-4 space-y-2">
              <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                ③ What you&apos;ll find
              </p>
              <p className="text-xs text-zinc-300 leading-relaxed">
                The first {matchCount} state step{matchCount === 1 ? "" : "s"} are{" "}
                <span className="text-emerald-400">identical</span> on both sides, the
                engines agree about the starting balances. At step{" "}
                <span className="text-red-400 font-mono">#{divergenceIdx}</span> (a{" "}
                <span className="font-mono">{op}</span>) they split apart. That split is
                the fraud.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => enterTrace(0)}
                className="px-3 py-1.5 text-xs rounded border border-emerald-800 text-emerald-300 hover:bg-emerald-950/40"
              >
                Walk from step #0 →
              </button>
              <button
                type="button"
                onClick={jumpToClash}
                className="px-3 py-1.5 text-xs rounded border border-red-800 text-red-300 hover:bg-red-950/40"
              >
                Skip to the clash ↯
              </button>
            </div>
          </div>
        ) : (
          /* ── Trace walkthrough ─────────────────────────────────────────── */
          <>
            {/* Clickable step timeline */}
            <div className="flex flex-wrap gap-1">
              {honestSteps.map((s, i) => {
                const agree =
                  claimedSteps[i] && stepsMatch(s, claimedSteps[i] as FilteredStep);
                const active = i === step;
                const isFraudStep = i === divergenceIdx && !agree;
                const downstream = i > divergenceIdx && !agree;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      setStep(i);
                      setShowVerdict(i === divergenceIdx && Boolean(isFraudStep));
                    }}
                    className={`text-[10px] font-mono px-2 py-1 rounded-full border transition-colors ${
                      active
                        ? "border-zinc-300 bg-zinc-800 text-zinc-100"
                        : isFraudStep
                          ? "border-red-700 bg-red-950/50 text-red-300"
                          : downstream
                            ? "border-amber-800/80 bg-amber-950/30 text-amber-400/90"
                            : agree
                              ? "border-emerald-800 bg-emerald-950/40 text-emerald-400"
                              : "border-zinc-700 bg-zinc-900 text-zinc-500"
                    }`}
                  >
                    #{i} {s.op}
                    {agree ? " ✓" : isFraudStep ? " ✗" : downstream ? " ↳" : ""}
                  </button>
                );
              })}
            </div>

            <p className="text-[10px] text-zinc-600 leading-snug">
              ✓ identical on both sides · ✗ first fraud step · ↳ later steps differ only
              because state already diverged
            </p>

            {honest && claimed ? (
              <>
                <div className="flex items-stretch gap-3">
                  <OpcodeCard
                    step={honest}
                    side="honest"
                    match={matched}
                    isClash={isClash}
                    engineType={engineType}
                  />
                  <div className="flex flex-col items-center justify-center px-1 shrink-0 min-w-[2.5rem]">
                    <span className="text-[10px] uppercase tracking-widest text-zinc-600">
                      vs
                    </span>
                    {matched ? (
                      <span className="text-xs text-emerald-400 font-semibold mt-1">match</span>
                    ) : isClash ? (
                      <span className="text-xs text-red-400 font-bold mt-1">clash</span>
                    ) : isDownstream ? (
                      <span className="text-[10px] text-amber-400/90 font-semibold mt-1 text-center leading-tight">
                        after fraud
                      </span>
                    ) : (
                      <span className="text-xs text-zinc-500 mt-1">diff</span>
                    )}
                  </div>
                  <OpcodeCard
                    step={claimed}
                    side="claimed"
                    match={matched}
                    isClash={isClash}
                    engineType={engineType}
                  />
                </div>

                {/* Plain-English narration of the current step */}
                <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 space-y-1.5">
                  <p className="text-[10px] uppercase tracking-widest text-zinc-500">
                    {honest.op}: {opHeadline(honest.op)}
                  </p>
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {isDownstream
                      ? `This step differs too, but it isn't the fraud. Once step #${divergenceIdx} wrote a different value, every later read and write inherits that difference. Bisection always pins the blame on the first divergence, step #${divergenceIdx}.`
                      : describeStep(honest, engineType)}
                  </p>
                  {matched && !isClash && (
                    <p className="text-[11px] text-emerald-400/90">
                      ✓ Both sides agree here, same opcode, same stack, same storage. No
                      fraud yet; bisection keeps going.
                    </p>
                  )}
                </div>
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
                   , diverged at #{divergenceIdx}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={goPrev}
                  className="px-3 py-1.5 text-xs rounded border border-zinc-700 text-zinc-300"
                >
                  {step === 0 ? "← Intro" : "← Prev"}
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
                  disabled={step >= lastStep}
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
                    This is the fraud, step #{divergenceIdx},{" "}
                    <span className="font-mono">{op}</span>
                  </p>

                  {/* What is being compared */}
                  <p className="text-xs text-zinc-300 leading-relaxed">
                    {divergence.whatCompared}
                  </p>

                  {/* Decoded value comparison */}
                  <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs font-mono border-y border-red-900/50 py-3">
                    {slot && (
                      <>
                        <span className="text-zinc-500">Storage slot</span>
                        <span className="text-zinc-300 break-all">
                          {slotMeaning(slot, engineType).label}
                          <span className="text-zinc-600"> · {shortHex(slot)}</span>
                        </span>
                      </>
                    )}
                    <span className="text-emerald-400">Honest engine</span>
                    <span className="text-emerald-300 break-all">
                      {divergence.honest.display}
                      {divergence.honest.kind === "number" && (
                        <span className="text-zinc-600"> ({shortHex(honestVal)})</span>
                      )}
                    </span>
                    <span className="text-red-400">Sequencer wrote</span>
                    <span className="text-red-300 break-all">
                      {divergence.claimed.display}
                      {divergence.claimed.kind === "number" && (
                        <span className="text-zinc-600"> ({shortHex(claimedVal)})</span>
                      )}
                    </span>
                  </div>

                  {divergence.deltaNote && (
                    <p className="text-xs text-amber-300/90 leading-relaxed font-mono">
                      {divergence.deltaNote}
                    </p>
                  )}

                  {/* Root cause tied to swap math */}
                  <p className="text-xs text-zinc-400 leading-relaxed">
                    {divergence.rootCause}
                  </p>

                  {/* Multi-line Solidity: honest engine vs the engine that lied. */}
                  {(lyingSource || honestSource || engineType) && (
                    <div className="border-t border-red-900/50 pt-3">
                      <EngineSourceCompare
                        engineType={engineType}
                        honestSource={honestSource}
                        lyingSource={lyingSource}
                        onchainDivergenceStep={onchainDivergenceStep}
                      />
                    </div>
                  )}

                  <p className="text-xs text-zinc-400 leading-relaxed border-t border-red-900/50 pt-3">
                    FraudProofGame re-executed the diverging VM step on L1. The batch is
                    rejected; the challenger takes both bonds minus a 10% burn from the
                    sequencer&apos;s stake.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </motion.div>
    </motion.div>
  );
}
