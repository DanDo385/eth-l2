"use client";

import { AccountSidebar } from "./AccountSidebar";
import { BlockchainCanvas } from "./BlockchainCanvas";
import { BlockInspector } from "./BlockInspector";
import { ControlPanel } from "./ControlPanel";
import { DemoGallery } from "./DemoGallery";
import { EventLogPanel } from "./EventLogPanel";
import { LabFrame, type LabMode } from "./LabFrame";
import { OptimisticTracker } from "./OptimisticTracker";
import { ResearchPanel } from "./ResearchPanel";
import { Scoreboard } from "./Scoreboard";
import { WelcomeBanner } from "./WelcomeBanner";
import { useAppStore } from "../lib/store";
import { SessionControlsProvider } from "../lib/sessionControls";

function LabContent({ mode }: { mode: LabMode }) {
  const { state, dispatch } = useAppStore();
  const selectedBatch =
    state.inspectedBatch !== null ? state.batches[state.inspectedBatch] : null;
  const isOptimistic = mode === "optimistic";

  function handleBatchClick(batchId: number) {
    dispatch({ type: "INSPECT_BATCH", batchId });
  }

  function handleZkBatchClick(batchId: number) {
    dispatch({ type: "INSPECT_ZK_BATCH", batchId });
    dispatch({ type: "SHOW_ZK_INSPECT", batchId });
    dispatch({ type: "MARK_EXPLORED", lane: "zk", batchId });
  }

  function handleOpcodeRace(batchId: number) {
    dispatch({ type: "SHOW_OPCODE_RACE", batchId });
    dispatch({ type: "MARK_EXPLORED", lane: "op", batchId });
  }

  return (
    <div className="mx-auto grid min-h-[calc(100vh-49px)] w-full max-w-[1800px] grid-cols-1 gap-4 p-4 2xl:grid-cols-[390px_minmax(0,1fr)]">
      <aside className="flex min-w-0 flex-col gap-4 overflow-y-auto 2xl:min-w-[390px]">
        <ControlPanel />
        <DemoGallery mode={mode} />
        <AccountSidebar mode={mode} showEventLog={false} />
      </aside>

      <section className="flex min-w-0 flex-col gap-4 overflow-y-auto">
        {!state.running && <WelcomeBanner mode={mode} />}

        {isOptimistic ? (
          <div
            className={
              selectedBatch
                ? "grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,420px)]"
                : "grid gap-4"
            }
          >
            <div className="space-y-4">
              <BlockchainCanvas mode={mode} onBatchClick={handleBatchClick} />
              <Scoreboard mode={mode} />
            </div>
            {selectedBatch && (
              <BlockInspector onShowOpcodeRace={handleOpcodeRace} />
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <BlockchainCanvas
              mode={mode}
              onBatchClick={handleBatchClick}
              onZkBatchClick={handleZkBatchClick}
            />
            <Scoreboard mode={mode} />
          </div>
        )}

        {isOptimistic && (
          <OptimisticTracker
            onBatchClick={handleBatchClick}
            onShowOpcodeRace={handleOpcodeRace}
          />
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
          <ResearchPanel mode={mode} />
          <EventLogPanel />
        </div>
      </section>
    </div>
  );
}

export function LabPage({ mode }: { mode: LabMode }) {
  return (
    <LabFrame mode={mode}>
      <SessionControlsProvider>
        <LabContent mode={mode} />
      </SessionControlsProvider>
    </LabFrame>
  );
}
