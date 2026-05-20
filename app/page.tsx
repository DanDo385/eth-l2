"use client";

import { useEffect } from "react";
import { AnimatePresence } from "framer-motion";

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

function Inner() {
  const { state, dispatch } = useAppStore();

  // Auto-start from URL hash on first connect
  useEffect(() => {
    if (!state.connected) return;
    const p = parseUrlHash();
    if (p.autostart) {
      apiPost("/api/start", { seed: p.seed, speed: p.speed });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.connected]);

  function handleBatchClick(batchId: number) {
    dispatch({ type: "INSPECT_BATCH", batchId });
  }

  function handleOpcodeRace(batchId: number) {
    dispatch({ type: "SHOW_OPCODE_RACE", batchId });
  }

  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <header className="border-b border-zinc-800 px-6 py-3 flex items-center gap-4">
        <h1 className="text-lg font-bold tracking-tight">
          Rollup Mechanics Lab
        </h1>
        <span className="text-xs text-zinc-600">
          Optimistic · ZK · Fraud proofs
        </span>
        <div className="ml-auto flex items-center gap-2 text-xs text-zinc-500">
          <span
            className={`w-1.5 h-1.5 rounded-full inline-block ${
              state.connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          {state.connected
            ? state.running
              ? "running"
              : "idle"
            : "disconnected"}
        </div>
      </header>

      <div className="grid grid-cols-[220px_1fr_240px] gap-4 p-4 h-[calc(100vh-49px)]">
        {/* Left sidebar */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <ControlPanel />
          <DemoGallery />
          <AccountSidebar />
        </aside>

        {/* Main canvas */}
        <section className="flex flex-col gap-4 overflow-y-auto min-w-0">
          <BlockchainCanvas onBatchClick={handleBatchClick} />
          <Scoreboard />
        </section>

        {/* Right panel */}
        <aside className="flex flex-col gap-4 overflow-y-auto">
          <BlockInspector onShowOpcodeRace={handleOpcodeRace} />
        </aside>
      </div>

      {/* Overlays */}
      <AnimatePresence>
        {state.opcodeRaceData && (
          <OpcodeRace
            key="opcode-race"
            data={state.opcodeRaceData}
            onClose={() => dispatch({ type: "CLOSE_OPCODE_RACE" })}
          />
        )}
        {state.zkInspectData && (
          <ZkInspect
            key="zk-inspect"
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
