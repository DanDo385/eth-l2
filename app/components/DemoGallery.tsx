"use client";

import { motion } from "framer-motion";
import {
  demosForMode,
  OP_SUSPICIOUS_60S,
  OP_SUSPICIOUS_120S,
} from "../data/demoGallery";
import { useSessionControlsContext } from "../lib/sessionControls";
import type { LabMode } from "./LabFrame";
import { InfoTip } from "./InfoTip";

function StatusBadge({
  kind,
}: {
  kind: "start" | "running" | "paused";
}) {
  const styles =
    kind === "paused"
      ? "border-amber-700/70 bg-amber-950/70 text-amber-300"
      : kind === "running"
        ? "border-emerald-700/70 bg-emerald-950/70 text-emerald-300"
        : "border-emerald-800/60 bg-emerald-950/50 text-emerald-400/90";

  const label =
    kind === "paused" ? "Paused" : kind === "running" ? "Running" : "Start here";

  return (
    <span
      className={`shrink-0 rounded border px-1.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${styles}`}
    >
      {label}
    </span>
  );
}

export function DemoGallery({ mode = "optimistic" }: { mode?: LabMode }) {
  const { launchDemo, busy, connected, active, paused, activeSeed } =
    useSessionControlsContext();
  const isZk = mode === "zk";
  const demos = demosForMode(mode);

  return (
    <div className="space-y-2.5 rounded-xl border border-zinc-800 bg-zinc-900 p-3">
      <div className="min-w-0">
        <div className="flex items-center gap-1.5">
          <p className="text-xs uppercase tracking-wide text-zinc-500">
            Demo gallery
          </p>
          <InfoTip label="How demo seeds work" placement="panel">
            {isZk
              ? "Invalid claims are ~1 in 16 batches. L1 rejects them at the verifier before accepting the new state root. Cards start at the speed set in controls."
              : `Fault injection is ~1 in 8 batches. In a 60s run at 4× expect ${OP_SUSPICIOUS_60S} suspicious batches; in 120s expect ${OP_SUSPICIOUS_120S}. Bonds make cheating unprofitable. Cards start at the speed set in controls.`}
          </InfoTip>
        </div>
        <p className="mt-0.5 text-sm leading-snug text-zinc-600">
          Pick a scenario. Seed 88 is the suggested entry point.
        </p>
      </div>

      {/* Single column: sidebar is too narrow for a 2×2 grid without crushing copy */}
      <div className="flex flex-col gap-1.5">
        {demos.map((demo) => {
          const isActive = active && activeSeed === demo.seed;
          const disabled = busy || !connected;
          const status: "start" | "running" | "paused" | null = isActive
            ? paused
              ? "paused"
              : "running"
            : demo.recommended
              ? "start"
              : null;

          return (
            <motion.div
              key={demo.seed}
              whileHover={disabled ? undefined : { scale: 1.005 }}
              className={`min-w-0 overflow-hidden rounded-lg border bg-zinc-950 transition-colors ${
                isActive
                  ? paused
                    ? "border-amber-500/80 ring-1 ring-amber-500/30"
                    : "border-emerald-500 ring-1 ring-emerald-500/40"
                  : demo.color
              } ${disabled ? "opacity-50" : ""}`}
            >
              <button
                type="button"
                onClick={() => launchDemo(demo.seed)}
                disabled={disabled}
                className={`flex w-full min-w-0 flex-col gap-1 px-2.5 py-2 text-left ${
                  disabled ? "cursor-not-allowed" : "cursor-pointer"
                }`}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <span
                    className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-xs ${demo.badge}`}
                  >
                    #{demo.seed}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-xs font-semibold text-zinc-200">
                    {demo.title}
                  </span>
                  {status && <StatusBadge kind={status} />}
                </div>
                <p className="text-xs leading-snug text-zinc-500">
                  {demo.caption}
                </p>
              </button>

              <div className="flex items-center gap-1.5 border-t border-zinc-800/80 px-2.5 py-1">
                <InfoTip label={`Details for seed ${demo.seed}`} placement="inline">
                  <span className="font-medium text-zinc-300">Why this seed: </span>
                  {demo.detail}
                </InfoTip>
                <span className="truncate text-xs text-zinc-700">
                  more detail
                </span>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
