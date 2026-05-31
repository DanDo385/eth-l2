"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import { BlockBox } from "./BlockBox";
import { OpBatchGroup, OpPendingBlock } from "./OpBatchGroup";
import type { BatchInfo } from "../types";
import { BATCH_WINDOW } from "../data/protocol";

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
          const dimmed =
            chain === "op-l2" &&
            inspectedBatch !== null &&
            !(batch && batch.batchId === inspectedBatch);
          return (
            <BlockBox
              key={n}
              blockNum={n}
              batch={batch}
              dimmed={dimmed}
              onClick={batch && !dimmed ? () => onBatchClick(batch.batchId) : undefined}
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
          const dimmed = inspectedBatch !== null && seg.batch.batchId !== inspectedBatch;
          return (
            <OpBatchGroup
              key={`b-${seg.batch.batchId}`}
              batch={seg.batch}
              blockNums={seg.blocks}
              dimmed={dimmed}
              selected={inspectedBatch === seg.batch.batchId}
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

export function BlockchainCanvas({ onBatchClick }: Props) {
  const { state } = useAppStore();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-6">
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Chain activity</p>
        <p className="text-[11px] text-zinc-600 mt-1 leading-relaxed">
          OP batches group {BATCH_WINDOW} L2 blocks under one posted state root. Click a batch to
          inspect why it is honest, suspicious, or proven fraudulent — then walk the opcode proof.
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
    </div>
  );
}
