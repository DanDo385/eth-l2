"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import { OpBatchGroup, OpPendingBlock } from "./OpBatchGroup";
import { ZkBatchGroup, ZkPendingBlock } from "./ZkBatchGroup";
import type { BatchInfo, ZkInspectPayload } from "../types";
import { BATCH_WINDOW } from "../data/protocol";
import { BLOCK_COLOR_LEGEND } from "../data/batchEducation";
import { ZK_DA_CAVEAT, ZK_PIPELINE_BEATS, ZK_VALIDITY_CAVEAT } from "../data/zkEducation";

const LANE_WINDOW = 20;

const CHAIN_LABELS: Record<string, string> = {
  l1: "L1 Mainnet",
  "op-l2": "OP L2",
  "zk-l2": "ZK L2",
};

const CHAIN_COLORS: Record<string, string> = {
  l1: "text-violet-400 border-violet-700",
  "op-l2": "text-blue-400 border-blue-700",
  "zk-l2": "text-emerald-400 border-emerald-700",
};

function findBatchForBlock(
  blockNum: number,
  batches: Record<number, BatchInfo>,
): BatchInfo | undefined {
  return Object.values(batches).find(
    (b) => b.l2StartBlock <= blockNum && blockNum <= b.l2EndBlock,
  );
}

function findZkRollupForBlock(
  blockNum: number,
  rollups: Record<number, ZkInspectPayload>,
): ZkInspectPayload | undefined {
  return Object.values(rollups).find((r) => {
    const start = r.l2StartBlock ?? r.l2EndBlock;
    return start <= blockNum && blockNum <= r.l2EndBlock;
  });
}

type OpSegment =
  | { kind: "batch"; batch: BatchInfo; blocks: number[] }
  | { kind: "pending"; blockNum: number };

type ZkSegment =
  | { kind: "batch"; rollup: ZkInspectPayload; blocks: number[] }
  | { kind: "pending"; blockNum: number };

function buildOpSegments(
  start: number,
  latestBlock: number,
  batches: Record<number, BatchInfo>,
): OpSegment[] {
  const segments: OpSegment[] = [];
  let n = start;
  while (n <= latestBlock) {
    const batch = findBatchForBlock(n, batches);
    if (batch) {
      const blocks: number[] = [];
      for (let b = batch.l2StartBlock; b <= batch.l2EndBlock; b++) {
        if (b >= start && b <= latestBlock) blocks.push(b);
      }
      segments.push({ kind: "batch", batch, blocks });
      n = batch.l2EndBlock + 1;
    } else {
      segments.push({ kind: "pending", blockNum: n });
      n++;
    }
  }
  return segments;
}

function buildZkSegments(
  start: number,
  latestBlock: number,
  rollups: Record<number, ZkInspectPayload>,
): ZkSegment[] {
  const segments: ZkSegment[] = [];
  let n = start;
  while (n <= latestBlock) {
    const rollup = findZkRollupForBlock(n, rollups);
    if (rollup) {
      const blocks: number[] = [];
      for (let b = rollup.l2StartBlock ?? rollup.l2EndBlock; b <= rollup.l2EndBlock; b++) {
        if (b >= start && b <= latestBlock) blocks.push(b);
      }
      segments.push({ kind: "batch", rollup, blocks });
      n = rollup.l2EndBlock + 1;
    } else {
      segments.push({ kind: "pending", blockNum: n });
      n++;
    }
  }
  return segments;
}

interface LaneProps {
  chain: string;
  latestBlock: number;
}

function StandardLane({ chain, latestBlock }: LaneProps) {
  const start = Math.max(1, latestBlock - LANE_WINDOW + 1);
  const blocks = Array.from(
    { length: latestBlock - start + 1 },
    (_, i) => start + i,
  );
  const colorCls = CHAIN_COLORS[chain] ?? "text-zinc-400 border-zinc-700";

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 border-b pb-2 ${colorCls}`}>
        <span className={`text-sm font-semibold ${colorCls.split(" ")[0]}`}>
          {CHAIN_LABELS[chain] ?? chain}
        </span>
        <span className="text-xs text-zinc-500 font-mono ml-auto">#{latestBlock}</span>
      </div>
      <div className="flex flex-wrap gap-1">
        {blocks.map((n) => (
          <span
            key={n}
            className="w-10 h-10 rounded border border-zinc-700 bg-zinc-900/80 flex items-center justify-center text-[9px] font-mono text-zinc-400"
          >
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

interface OpLaneProps {
  latestBlock: number;
  batches: Record<number, BatchInfo>;
  onBatchClick: (batchId: number) => void;
  inspectedBatch: number | null;
}

function OpLane({ latestBlock, batches, onBatchClick, inspectedBatch }: OpLaneProps) {
  const start = Math.max(1, latestBlock - LANE_WINDOW + 1);
  const segments = buildOpSegments(start, latestBlock, batches);
  const colorCls = CHAIN_COLORS["op-l2"];

  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap items-center gap-2 border-b pb-2 ${colorCls}`}>
        <span className="text-sm font-semibold text-blue-400">OP L2</span>
        <span className="text-[10px] text-zinc-500 hidden sm:inline">
          batches of {BATCH_WINDOW} blocks → one L1 state root
        </span>
        <span className="text-xs text-zinc-500 font-mono ml-auto">#{latestBlock}</span>
      </div>
      <div className="flex flex-wrap gap-2 items-start">
        {segments.map((seg) => {
          if (seg.kind === "pending") {
            return <OpPendingBlock key={`p-${seg.blockNum}`} blockNum={seg.blockNum} />;
          }
          const selected = inspectedBatch === seg.batch.batchId;
          const dimmed = inspectedBatch !== null && !selected;
          return (
            <OpBatchGroup
              key={`b-${seg.batch.batchId}`}
              batch={seg.batch}
              blockNums={seg.blocks}
              dimmed={dimmed}
              selected={selected}
              onClick={() => onBatchClick(seg.batch.batchId)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface ZkLaneProps {
  latestBlock: number;
  rollups: Record<number, ZkInspectPayload>;
  onBatchClick: (batchId: number) => void;
  inspectedBatch: number | null;
}

function ZkLane({ latestBlock, rollups, onBatchClick, inspectedBatch }: ZkLaneProps) {
  const start = Math.max(1, latestBlock - LANE_WINDOW + 1);
  const segments = buildZkSegments(start, latestBlock, rollups);
  const colorCls = CHAIN_COLORS["zk-l2"];

  return (
    <div className="space-y-2">
      <div className={`flex flex-wrap items-center gap-2 border-b pb-2 ${colorCls}`}>
        <span className="text-sm font-semibold text-emerald-400">ZK L2</span>
        <span className="text-[10px] text-zinc-500 hidden sm:inline">
          batches of {BATCH_WINDOW} blocks → one validity proof on L1
        </span>
        <span className="text-xs text-zinc-500 font-mono ml-auto">#{latestBlock}</span>
      </div>
      <div className="flex flex-wrap gap-2 items-start">
        {segments.map((seg) => {
          if (seg.kind === "pending") {
            return <ZkPendingBlock key={`p-${seg.blockNum}`} blockNum={seg.blockNum} />;
          }
          const selected = inspectedBatch === seg.rollup.batchId;
          const dimmed = inspectedBatch !== null && !selected;
          return (
            <ZkBatchGroup
              key={`z-${seg.rollup.batchId}`}
              rollup={seg.rollup}
              blockNums={seg.blocks}
              dimmed={dimmed}
              selected={selected}
              onClick={() => onBatchClick(seg.rollup.batchId)}
            />
          );
        })}
      </div>
    </div>
  );
}

interface Props {
  onBatchClick: (batchId: number) => void;
  onZkBatchClick?: (batchId: number) => void;
  mode?: "all" | "optimistic" | "zk";
}

function ColorLegend({ mode }: { mode: "all" | "optimistic" | "zk" }) {
  const legend =
    mode === "zk"
      ? [
          { short: "pending", label: "Collecting", border: "border-zinc-700", bg: "bg-zinc-900/50", description: "L2 blocks waiting for the next proof batch." },
          { short: "accepted", label: "Verifier accepted", border: "border-emerald-700", bg: "bg-emerald-950/30", description: "L1 accepted the claimed root in this model." },
          { short: "rejected", label: "Verifier rejected", border: "border-red-800", bg: "bg-red-950/30", description: "Invalid claim rejected at the validity gate." },
        ]
      : BLOCK_COLOR_LEGEND;

  return (
    <div className="flex flex-wrap gap-2">
      {legend.map((item) => (
        <div
          key={item.label}
          title={item.description}
          className={`flex items-center gap-1.5 px-2 py-1 rounded border text-[10px] ${item.border} ${item.bg}`}
        >
          <span className="font-mono text-zinc-300">{item.short}</span>
          <span className="text-zinc-400">{item.label}</span>
        </div>
      ))}
    </div>
  );
}

function ZkPipelineStrip() {
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      {ZK_PIPELINE_BEATS.map((beat) => (
        <div
          key={beat.label}
          className="rounded-lg border border-emerald-900/50 bg-emerald-950/15 px-3 py-2"
        >
          <p className="text-[10px] font-semibold text-emerald-300">
            {beat.num} {beat.label}
          </p>
          <p className="text-[10px] text-zinc-500 mt-0.5">{beat.hint}</p>
        </div>
      ))}
    </div>
  );
}

export function BlockchainCanvas({ onBatchClick, onZkBatchClick, mode = "all" }: Props) {
  const { state } = useAppStore();
  const showOp = mode === "all" || mode === "optimistic";
  const showZk = mode === "all" || mode === "zk";
  const helper =
    mode === "optimistic"
      ? "OP batches group L2 blocks under one posted output root. Suspicious roots wait for local verification and a user challenge."
      : mode === "zk"
        ? "ZK batches group L2 blocks under one proof submission. Click a batch card to inspect public inputs and verifier results."
        : "OP and ZK share L2 traffic here, but they settle state through different security gates.";

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-6">
      <div className="space-y-2">
        <div className="flex flex-wrap items-baseline gap-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Chain activity</p>
          <p className="text-[10px] text-zinc-600">
            {mode === "zk"
              ? "click a proof batch to open the concept tour"
              : "click a batch to inspect · hover a legend chip to see what each color means"}
          </p>
        </div>
        <ColorLegend mode={mode} />
        <p className="text-[11px] text-zinc-600 leading-relaxed">{helper}</p>
        {mode === "zk" && (
          <>
            <ZkPipelineStrip />
            <div className="rounded-lg border border-amber-900/50 bg-amber-950/15 px-3 py-2 space-y-1">
              <p className="text-[10px] font-semibold text-amber-300">Validity, not privacy or DA</p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">{ZK_VALIDITY_CAVEAT}</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">{ZK_DA_CAVEAT}</p>
            </div>
          </>
        )}
      </div>

      <StandardLane chain="l1" latestBlock={safeNum(state.blocks.l1)} />

      {showOp && (
        <OpLane
          latestBlock={safeNum(state.blocks["op-l2"])}
          batches={state.batches}
          onBatchClick={onBatchClick}
          inspectedBatch={state.inspectedBatch}
        />
      )}

      {showZk && (
        <ZkLane
          latestBlock={safeNum(state.blocks["zk-l2"])}
          rollups={state.zkRollups}
          onBatchClick={onZkBatchClick ?? onBatchClick}
          inspectedBatch={state.inspectedZkBatch}
        />
      )}
    </div>
  );
}
