"use client";

import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import type { DisputeResolvedPayload, FilteredStep } from "../types";

const STEP_RATE_MS = 66; // ~15 steps/sec
const VISIBLE_STEPS = 8;

interface TapeProps {
  steps: FilteredStep[];
  currentIdx: number;
  divergenceIdx: number;
  label: string;
  frozen: boolean;
  side: "honest" | "claimed";
}

function opColor(op: string, side: "honest" | "claimed", atDiv: boolean): string {
  if (atDiv) return side === "honest" ? "border-emerald-400 bg-emerald-900/40" : "border-red-400 bg-red-900/40";
  if (op === "SSTORE") return "border-violet-500 bg-violet-900/30";
  if (op === "SLOAD") return "border-blue-500 bg-blue-900/30";
  if (op.startsWith("CALL") || op === "STATICCALL" || op === "DELEGATECALL")
    return "border-yellow-500 bg-yellow-900/20";
  return "border-zinc-700 bg-zinc-800/50";
}

function Tape({ steps, currentIdx, divergenceIdx, label, frozen, side }: TapeProps) {
  const windowStart = Math.max(0, currentIdx - 3);
  const slice = steps.slice(windowStart, windowStart + VISIBLE_STEPS);

  return (
    <div className="flex-1 space-y-1 min-w-0">
      <p className={`text-xs font-semibold text-center ${side === "honest" ? "text-emerald-400" : "text-red-400"}`}>
        {label}
      </p>
      <div className="flex gap-1 overflow-hidden justify-center">
        {slice.map((step, i) => {
          const absIdx = windowStart + i;
          const isDiv = absIdx === divergenceIdx;
          const isCurrent = absIdx === currentIdx;
          return (
            <motion.div
              key={absIdx}
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: isDiv ? 1.5 : isCurrent ? 1.1 : 1,
              }}
              className={`
                flex flex-col items-center justify-center rounded border px-1 py-0.5
                text-[9px] font-mono min-w-[36px] shrink-0
                ${opColor(step.op, side, isDiv)}
                ${isCurrent && !frozen ? "ring-1 ring-white/30" : ""}
              `}
            >
              <span>{step.op}</span>
              <span className="text-zinc-500 text-[8px]">#{absIdx}</span>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  data: DisputeResolvedPayload;
  onClose: () => void;
}

export function OpcodeRace({ data, onClose }: Props) {
  const { divergenceIdx, honestSteps, claimedSteps, op, slot, honestVal, claimedVal } = data;
  const maxSteps = Math.max(honestSteps.length, claimedSteps.length);
  const [currentIdx, setCurrentIdx] = useState(0);
  const frozen = currentIdx >= divergenceIdx;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setCurrentIdx(0);
    timerRef.current = setInterval(() => {
      setCurrentIdx((prev) => {
        if (prev >= divergenceIdx) {
          if (timerRef.current) clearInterval(timerRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, STEP_RATE_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [divergenceIdx]);

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
        className="bg-zinc-950 border border-zinc-700 rounded-2xl w-full max-w-2xl p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-zinc-100">OpcodeRace</h2>
          <button
            onClick={onClose}
            className="text-zinc-500 hover:text-zinc-300 text-2xl leading-none"
          >
            ×
          </button>
        </div>

        <div className="relative flex gap-4 items-start">
          <Tape
            steps={honestSteps}
            currentIdx={currentIdx}
            divergenceIdx={divergenceIdx}
            label="Honest"
            frozen={frozen}
            side="honest"
          />

          {/* Divider appears at divergence */}
          <AnimatePresence>
            {frozen && (
              <motion.div
                initial={{ scaleY: 0, opacity: 0 }}
                animate={{ scaleY: 1, opacity: 1 }}
                className="w-px bg-red-500 self-stretch"
              />
            )}
          </AnimatePresence>

          <Tape
            steps={claimedSteps}
            currentIdx={currentIdx}
            divergenceIdx={divergenceIdx}
            label="Claimed (lying)"
            frozen={frozen}
            side="claimed"
          />
        </div>

        <div className="text-center text-xs text-zinc-500 font-mono">
          step {currentIdx} / {maxSteps - 1}
          {frozen && (
            <span className="ml-2 text-red-400 font-semibold">
              ← DIVERGED AT #{divergenceIdx}
            </span>
          )}
        </div>

        <AnimatePresence>
          {frozen && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-red-700 bg-red-950/40 p-4 space-y-2"
            >
              <p className="text-xs text-red-400 font-bold uppercase tracking-wide">
                Divergence — op: {op}
              </p>
              {slot && (
                <div className="grid grid-cols-3 gap-2 text-xs font-mono">
                  <span className="text-zinc-500">Slot</span>
                  <span className="col-span-2 text-zinc-300 break-all">{slot}</span>
                  <span className="text-emerald-400">Honest</span>
                  <span className="col-span-2 text-emerald-300 break-all">{honestVal}</span>
                  <span className="text-red-400">Claimed</span>
                  <span className="col-span-2 text-red-300 break-all">{claimedVal}</span>
                </div>
              )}
              <button
                onClick={() => setCurrentIdx(0)}
                className="text-xs text-zinc-500 hover:text-zinc-300 underline"
              >
                Replay
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
}
