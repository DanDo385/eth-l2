"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import { BlockBox } from "./BlockBox";
import { OpBatchGroup, OpPendingBlock } from "./OpBatchGroup";
import type { BatchInfo } from "../types";
import { BATCH_WINDOW } from "../data/protocol";
import { BLOCK_COLOR_LEGEND } from "../data/batchEducation";

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

type OpSegment =
  | { kind: "batch"; batch: BatchInfo; blocks: number[] }
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

interface LaneProps {
  chain: string;
  latestBlock: number;
  batches: Record<number, BatchInfo>;
  onBatchClick: (batchId: number) => void;
  inspectedBatch: number | null;
}

function StandardLane({ chain, latestBlock, batches, onBatchClick, inspectedBatch }: LaneProps) {
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
        {blocks.map((n) => {
          const batch = chain === "op-l2" ? findBatchForBlock(n, batches) : undefined;
          return (
            <BlockBox
              key={n}
              blockNum={n}
              batch={batch}
              dimmed={
                chain === "op-l2" &&
                inspectedBatch !== null &&
                batch !== undefined &&
                batch.batchId !== inspectedBatch
              }
              selected={
                chain === "op-l2" &&
                batch !== undefined &&
                batch.batchId === inspectedBatch
              }
              onClick={batch ? () => onBatchClick(batch.batchId) : undefined}
            />
          );
        })}
      </div>
    </div>
  );
}

function OpLane({ latestBlock, batches, onBatchClick, inspectedBatch }: Omit<LaneProps, "chain">) {
  const start = Math.max(1, latestBlock - LANE_WINDOW + 1);
  const segments = buildOpSegments(start, latestBlock, batches);
  const colorCls = CHAIN_COLORS["op-l2"];

  return (
    <div className="space-y-2">
      <div className={`flex items-center gap-2 border-b pb-2 ${colorCls}`}>
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

interface Props {
  onBatchClick: (batchId: number) => void;
}

function ColorLegend() {
  return (
    <div className="flex flex-wrap gap-2">
      {BLOCK_COLOR_LEGEND.map((item) => (
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

export function BlockchainCanvas({ onBatchClick }: Props) {
  const { state } = useAppStore();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-6">
      <div className="space-y-2">
        <div className="flex items-baseline gap-3">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Chain activity</p>
          <p className="text-[10px] text-zinc-600">
            click a batch to inspect · hover a legend chip to see what each color means
          </p>
        </div>
        <ColorLegend />
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          OP batches group {BATCH_WINDOW} L2 blocks under one posted state root. A valid batch stays blue; a fraud proof turns it red.
        </p>
      </div>

      <StandardLane
        chain="l1"
        latestBlock={safeNum(state.blocks.l1)}
        batches={state.batches}
        onBatchClick={onBatchClick}
        inspectedBatch={state.inspectedBatch}
      />

      <OpLane
        latestBlock={safeNum(state.blocks["op-l2"])}
        batches={state.batches}
        onBatchClick={onBatchClick}
        inspectedBatch={state.inspectedBatch}
      />

      <StandardLane
        chain="zk-l2"
        latestBlock={safeNum(state.blocks["zk-l2"])}
        batches={state.batches}
        onBatchClick={onBatchClick}
        inspectedBatch={state.inspectedBatch}
      />

      <p className="text-[10px] text-zinc-600 leading-relaxed border-l-2 border-emerald-900 pl-2">
        ZK lane: same swap traffic, different trust model, every batch needs a validity proof.
        Use the scoreboard&apos;s <span className="text-emerald-500">ZK in three beats</span> strip
        or Proof lab to walk the concept tour.
      </p>
    </div>
  );
}
