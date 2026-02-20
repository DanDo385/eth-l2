"use client";

import { useEffect, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { fetchReport, fetchOpBatches, fetchOpDisputes, MOCK_LAYER3_TRADES } from "./lib/data";
import { L1Mainnet } from "./components/L1Mainnet";
import { L2Optimistic } from "./components/L2Optimistic";
import { L2ZK } from "./components/L2ZK";
import { TransactionFlow } from "./components/TransactionFlow";
import { BatchCompaction } from "./components/BatchCompaction";
import { ChallengeFlow } from "./components/ChallengeFlow";
import type { Report, OpBatch, OpDispute } from "./types";

const TRADERS = ["0x3C44...93BC", "0x90F7...b906", "0x15d3...6A65", "0x9965...04dc", "0x14dC...5FEe"];

export default function Home() {
  const [report, setReport] = useState<Report | null>(null);
  const [opBatches, setOpBatches] = useState<OpBatch[]>([]);
  const [opDisputes, setOpDisputes] = useState<OpDispute[]>([]);
  const [trades, setTrades] = useState<import("./types").Layer3Trade[]>(MOCK_LAYER3_TRADES);
  const [simulating, setSimulating] = useState(false);

  const simulateTrade = useCallback(() => {
    setSimulating(true);
    const id = trades.length;
    const newTrade = {
      id,
      trader: TRADERS[id % TRADERS.length],
      amountIn: `${Math.floor(Math.random() * 50) + 5} L3`,
      amountOut: `${Math.floor(Math.random() * 5000) + 500} L3`,
      nonce: 0,
      status: "pending" as const,
      chain: (id % 2 === 0 ? "op" : "zk") as "op" | "zk",
    };
    setTrades((prev) => [...prev, newTrade]);
    const t1 = setTimeout(() => {
      setTrades((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "l2_executing" as const } : t))
      );
    }, 300);
    const t2 = setTimeout(() => {
      setTrades((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "batched" as const } : t))
      );
    }, 800);
    const t3 = setTimeout(() => {
      setTrades((prev) =>
        prev.map((t) => (t.id === id ? { ...t, status: "finalized" as const, batchId: 0 } : t))
      );
      setSimulating(false);
    }, 1500);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [trades.length]);

  useEffect(() => {
    (async () => {
      const [r, batches, disputes] = await Promise.all([
        fetchReport(),
        fetchOpBatches(),
        fetchOpDisputes(),
      ]);
      setReport(r ?? null);
      setOpBatches(batches);
      setOpDisputes(disputes);
    })();
  }, []);

  const finalizedCount = opBatches.filter((b) => !b.isBad).length;

  return (
    <main className="min-h-screen p-6 md:p-10">
      <motion.header
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-10"
      >
        <h1 className="text-3xl md:text-4xl font-bold text-zinc-100">
          Rollup Mechanics Lab
        </h1>
        <p className="text-zinc-500 mt-1">
          L1 vs L2 Optimistic vs L2 ZK · Layer3 token trades
        </p>
      </motion.header>

      {/* Top: Layer3 trades */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <span className="text-sm text-zinc-500">Layer3 token trades</span>
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={simulateTrade}
            disabled={simulating}
            className="px-4 py-2 rounded-lg bg-emerald-500/20 text-emerald-400 text-sm font-medium border border-emerald-500/40 hover:bg-emerald-500/30 disabled:opacity-50"
          >
            {simulating ? "Processing…" : "Simulate Trade"}
          </motion.button>
        </div>
        <TransactionFlow trades={trades} />
      </div>

      {/* Middle: L2 OP and L2 ZK side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <L2ZK report={report} />
        <div className="space-y-4">
          <L2Optimistic batches={opBatches} disputes={opDisputes} report={report} />
          <BatchCompaction />
          <ChallengeFlow />
        </div>
      </div>

      {/* Bottom: L1 Mainnet (large) */}
      <L1Mainnet report={report} opBatchCount={opBatches.length} finalizedCount={finalizedCount} />

      <motion.footer
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-12 text-center text-sm text-zinc-600"
      >
        Run <code className="px-1.5 py-0.5 rounded bg-zinc-800">make start deploy op analyze artifacts</code>{" "}
        then refresh for live data
      </motion.footer>
    </main>
  );
}
