"use client";

import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { AppStoreProvider, useAppStore } from "../lib/store";
import { parseUrlHash } from "../lib/url";
import { apiPost } from "../lib/ws";
import { OpcodeRace } from "./OpcodeRace";
import { ZkInspect } from "./ZkInspect";

export type LabMode = "optimistic" | "zk";

interface HeaderProps {
  mode: LabMode;
}

function LabHeader({ mode }: HeaderProps) {
  const { state } = useAppStore();
  const isOptimistic = mode === "optimistic";

  return (
    <header className="border-b border-zinc-800 px-4 sm:px-6 py-3">
      <div className="flex flex-wrap items-center gap-4">
        <div>
          <h1 className="text-lg font-bold leading-tight tracking-tight">
            {isOptimistic ? "Optimistic Rollup Lab" : "ZK Rollup Lab"}
          </h1>
          <p className="mt-0.5 text-[10px] leading-none text-zinc-600">
            {isOptimistic
              ? "Output roots · local verification · user challenges · bond settlement"
              : "Witnesses · proof generation · L1 verifier · validity settlement"}
          </p>
        </div>

        <nav className="flex items-center gap-2 text-xs">
          <Link href="/" className="btn-zinc px-2 py-1 text-xs">
            Home
          </Link>
          <Link
            href="/op"
            className={isOptimistic ? "btn-green px-2 py-1 text-xs" : "btn-zinc px-2 py-1 text-xs"}
          >
            Optimistic
          </Link>
          <Link
            href="/zk"
            className={!isOptimistic ? "btn-green px-2 py-1 text-xs" : "btn-zinc px-2 py-1 text-xs"}
          >
            ZK
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <span className="hidden text-[10px] text-zinc-600 sm:block">
            {state.running
              ? state.paused
                ? "simulation paused"
                : "simulation running"
              : state.connected
                ? "ready, pick a seed and start"
                : ""}
          </span>
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${
              state.connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span aria-live="polite">
            {state.connected
              ? state.running
                ? state.paused
                  ? "paused"
                  : "running"
                : "idle"
              : "disconnected"}
          </span>
        </div>
      </div>
    </header>
  );
}

function LabRuntime({ mode, children }: { mode: LabMode; children: ReactNode }) {
  const { state, dispatch } = useAppStore();
  const autostartAttempted = useRef(false);

  useEffect(() => {
    if (!state.connected) return;
    if (autostartAttempted.current) return;
    const p = parseUrlHash();
    if (p.autostart && !state.running) {
      autostartAttempted.current = true;
      void apiPost("/api/start", { seed: p.seed, speed: p.speed });
    }
  }, [state.connected, state.running]);

  useEffect(() => {
    if (!state.lastError) return;
    const t = setTimeout(() => dispatch({ type: "DISMISS_ERROR" }), 6000);
    return () => clearTimeout(t);
  }, [state.lastError, dispatch]);

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <LabHeader mode={mode} />
      {children}

      <AnimatePresence>
        {state.lastError && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-14 left-1/2 z-50 flex max-w-lg -translate-x-1/2 items-center gap-3 rounded-lg border border-red-600 bg-red-950 px-4 py-2 text-xs font-mono text-red-200 shadow-xl"
          >
            <span className="font-bold text-red-400">[{state.lastError.chain}]</span>
            <span className="flex-1 truncate">{state.lastError.message}</span>
            <button
              onClick={() => dispatch({ type: "DISMISS_ERROR" })}
              aria-label="Dismiss error"
              className="ml-1 text-base leading-none text-red-500 hover:text-red-300"
            >
              x
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence mode="wait">
        {mode === "optimistic" && state.opcodeRaceData && (
          <OpcodeRace
            key={`opcode-${state.opcodeRaceData.batchId}`}
            data={state.opcodeRaceData}
            onClose={() => dispatch({ type: "CLOSE_OPCODE_RACE" })}
          />
        )}
        {mode === "zk" && state.zkInspectData && (
          <ZkInspect
            key={`zk-${state.zkInspectData.batchId}`}
            data={state.zkInspectData}
            onClose={() => dispatch({ type: "CLOSE_ZK_INSPECT" })}
          />
        )}
      </AnimatePresence>
    </main>
  );
}

export function LabFrame({
  mode,
  children,
}: {
  mode: LabMode;
  children: ReactNode;
}) {
  return (
    <AppStoreProvider>
      <LabRuntime mode={mode}>{children}</LabRuntime>
    </AppStoreProvider>
  );
}
