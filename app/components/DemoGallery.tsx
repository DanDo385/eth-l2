"use client";

import { motion } from "framer-motion";
import {
  demosForMode,
  OP_SUSPICIOUS_60S,
  OP_SUSPICIOUS_120S,
} from "../data/demoGallery";
import { useSessionControlsContext } from "../lib/sessionControls";
import type { LabMode } from "./LabFrame";

export function DemoGallery({ mode = "optimistic" }: { mode?: LabMode }) {
  const { launchDemo, busy, connected, active, activeSeed } = useSessionControlsContext();
  const isZk = mode === "zk";
  const demos = demosForMode(mode);

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Demo gallery</p>
        <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
          Click any card to start at the speed set above. Seed 88 is the suggested entry point.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {demos.map((demo) => {
          const isActive = active && activeSeed === demo.seed;
          const disabled = busy || !connected;

          return (
            <motion.button
              key={demo.seed}
              whileHover={disabled ? undefined : { scale: 1.02 }}
              whileTap={disabled ? undefined : { scale: 0.97 }}
              onClick={() => launchDemo(demo.seed)}
              disabled={disabled}
              className={`text-left p-3 rounded-lg border bg-zinc-950 transition-colors min-w-0 relative ${
                isActive
                  ? "border-emerald-500 ring-1 ring-emerald-500/40"
                  : demo.color
              } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
              title={demo.detail}
            >
              {isActive ? (
                <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wide text-emerald-300 font-semibold">
                  running
                </span>
              ) : demo.recommended ? (
                <span className="absolute top-1.5 right-1.5 text-[9px] uppercase tracking-wide text-emerald-400/90">
                  start here
                </span>
              ) : null}
              <div className="flex items-start gap-2 mb-1 min-w-0">
                <span
                  className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${demo.badge}`}
                >
                  #{demo.seed}
                </span>
                <span className="text-xs font-semibold text-zinc-200 leading-snug pr-12">
                  {demo.title}
                </span>
              </div>
              <p className="text-[10px] text-zinc-500 leading-snug break-words">{demo.caption}</p>
            </motion.button>
          );
        })}
      </div>
      <p className="text-[10px] text-zinc-700 leading-relaxed border-t border-zinc-800 pt-2">
        {isZk
          ? "Invalid claims are ~1 in 16 batches. L1 rejects them at the verifier before accepting the new state root."
          : `Fault injection is ~1 in 8 batches. In a 60s run at 4× expect ${OP_SUSPICIOUS_60S} suspicious batches to verify and challenge; in 120s expect ${OP_SUSPICIOUS_120S}. Economic bonds make cheating unprofitable even when technically possible.`}
      </p>
    </div>
  );
}
