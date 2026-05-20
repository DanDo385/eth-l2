"use client";

import { useAppStore } from "../lib/store";
import { BlockBox } from "./BlockBox";
import type { BatchInfo } from "../types";

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

interface LaneProps {
  chain: string;
  latestBlock: number;
  batches: Record<number, BatchInfo>;
  onBlockClick: (blockNum: number, batch?: BatchInfo) => void;
  inspectedBatch: number | null;
}

function findBatchForBlock(
  blockNum: number,
  chain: string,
  batches: Record<number, BatchInfo>,
): BatchInfo | undefined {
  if (chain !== "op-l2") return undefined;
  return Object.values(batches).find(
    (b) => b.l2StartBlock <= blockNum && blockNum <= b.l2EndBlock,
  );
}

function Lane({ chain, latestBlock, batches, onBlockClick, inspectedBatch }: LaneProps) {
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
        <span className="text-xs text-zinc-500 font-mono ml-auto">
          #{latestBlock}
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {blocks.map((n) => {
          const batch = findBatchForBlock(n, chain, batches);
          // Dim op-l2 blocks that don't belong to the currently inspected batch.
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
              onClick={batch && !dimmed ? () => onBlockClick(n, batch) : undefined}
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

  function handleBlockClick(_blockNum: number, batch?: BatchInfo) {
    if (batch) onBatchClick(batch.batchId);
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-6">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">
        Chain activity
      </p>
      {(["l1", "op-l2", "zk-l2"] as const).map((chain) => (
        <Lane
          key={chain}
          chain={chain}
          latestBlock={state.blocks[chain] ?? 0}
          batches={state.batches}
          onBlockClick={handleBlockClick}
          inspectedBatch={state.inspectedBatch}
        />
      ))}
    </div>
  );
}
