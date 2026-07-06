"use client";

import { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

import { AppStoreProvider, useAppStore } from "./lib/store";
import { parseUrlHash } from "./lib/url";
import { apiPost } from "./lib/ws";

import { ControlPanel } from "./components/ControlPanel";
import { AccountSidebar } from "./components/AccountSidebar";
import { BlockchainCanvas } from "./components/BlockchainCanvas";
import { BlockInspector } from "./components/BlockInspector";
import { OpcodeRace } from "./components/OpcodeRace";
import { ZkInspect } from "./components/ZkInspect";
import { Scoreboard } from "./components/Scoreboard";
import { DemoGallery } from "./components/DemoGallery";
import { ResearchPanel } from "./components/ResearchPanel";
import { WelcomeBanner } from "./components/WelcomeBanner";
import { OptimisticTracker } from "./components/OptimisticTracker";

function Inner() {
  const { state, dispatch } = useAppStore();
  const autostartAttempted = useRef(false);

  // Auto-start from URL hash on first connect
  useEffect(() => {
    if (!state.connected) return;
    if (autostartAttempted.current) return;
    const p = parseUrlHash();
    if (p.autostart && !state.running) {
      autostartAttempted.current = true;
      apiPost("/api/start", { seed: p.seed, speed: p.speed });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connected, state.running]);

  // Auto-dismiss backend errors after 6 s
  useEffect(() => {
    if (!state.lastError) return;
    const t = setTimeout(() => dispatch({ type: "DISMISS_ERROR" }), 6000);
    return () => clearTimeout(t);
  }, [state.lastError, dispatch]);

  function handleBatchClick(batchId: number) {
    dispatch({ type: "INSPECT_BATCH", batchId });
  }

  function handleOpcodeRace(batchId: number) {
    dispatch({ type: "SHOW_OPCODE_RACE", batchId });
    dispatch({ type: "MARK_EXPLORED", lane: "op", batchId });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-lg font-bold tracking-tight leading-tight">
            Rollup Mechanics Lab
          </h1>
          <p className="text-[10px] text-zinc-600 leading-none mt-0.5">
            Live simulation · Optimistic fraud proofs · ZK validity proofs
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-xs text-zinc-500">
          <span className="hidden sm:block text-[10px] text-zinc-600">
            {state.running
              ? state.paused
                ? "⏸ simulation paused"
                : "▶ simulation running"
              : state.connected
              ? "● ready, pick a demo or enter a seed"
              : ""}
          </span>
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full inline-block ${
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
      </header>

      <div className="grid grid-cols-1 xl:grid-cols-[330px_1fr_240px] gap-4 p-4 min-h-[calc(100vh-49px)]">
        {/* Left sidebar */}
        <aside className="flex flex-col gap-4 overflow-y-auto min-w-0 xl:min-w-[330px]">
          <ControlPanel />
          <DemoGallery />
          <AccountSidebar />
        </aside>

        {/* Main canvas */}
        <section className="flex flex-col gap-4 overflow-y-auto min-w-0">
          {!state.running && <WelcomeBanner />}
          <BlockchainCanvas onBatchClick={handleBatchClick} />
          <OptimisticTracker
            onBatchClick={handleBatchClick}
            onShowOpcodeRace={handleOpcodeRace}
          />
          <Scoreboard />
        </section>

        {/* Right panel */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <BlockInspector onShowOpcodeRace={handleOpcodeRace} />
          <ResearchPanel />
        </aside>
      </div>

      {/* Error banner */}
      <AnimatePresence>
        {state.lastError && (
          <motion.div
            key="error-banner"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="fixed top-14 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-red-950 border border-red-600 text-red-200 text-xs font-mono px-4 py-2 rounded-lg shadow-xl max-w-lg"
          >
            <span className="text-red-400 font-bold">[{state.lastError.chain}]</span>
            <span className="flex-1 truncate">{state.lastError.message}</span>
            <button
              onClick={() => dispatch({ type: "DISMISS_ERROR" })}
              aria-label="Dismiss error"
              className="text-red-500 hover:text-red-300 text-base leading-none ml-1"
            >
              ×
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Overlays, user opens from Proof lab or batch inspector; never auto-popup */}
      <AnimatePresence mode="wait">
        {state.opcodeRaceData && (
          <OpcodeRace
            key={`opcode-${state.opcodeRaceData.batchId}`}
            data={state.opcodeRaceData}
            onClose={() => dispatch({ type: "CLOSE_OPCODE_RACE" })}
          />
        )}
        {!state.opcodeRaceData && state.zkInspectData && (
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

export default function Home() {
  return (
    <AppStoreProvider>
      <Inner />
    </AppStoreProvider>
  );
}
