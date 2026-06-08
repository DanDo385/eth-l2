"use client";

import { motion } from "framer-motion";
import type { Layer3Trade } from "../types";

interface WethPriceChartProps {
  trades: Layer3Trade[];
}

function tradeImpact(trade: Layer3Trade) {
  const amount = Number.parseFloat(trade.amountIn.replace(/[^0-9.]/g, "")) || 0;
  const direction = trade.chain === "op" ? 1 : -0.45;
  const invalidation = trade.status === "invalidated" ? -2.4 : 0;
  return direction * amount * 0.18 + invalidation;
}

export function WethPriceChart({ trades }: WethPriceChartProps) {
  const points = trades.reduce<number[]>((series, trade) => {
    const last = series[series.length - 1] ?? 1850;
    series.push(Math.max(1700, Math.min(2050, last + tradeImpact(trade))));
    return series;
  }, [1850]);

  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = Math.max(1, max - min);
  const polyline = points
    .map((price, index) => {
      const x = (index / Math.max(1, points.length - 1)) * 100;
      const y = 100 - ((price - min) / range) * 78 - 10;
      return `${x},${y}`;
    })
    .join(" ");
  const last = points[points.length - 1];
  const first = points[0];
  const direction = last >= first ? "up" : "down";
  const badBatchSeen = trades.some((trade) => trade.status === "invalidated");

  return (
    <section className="rounded-2xl border border-cyan-500/30 bg-gradient-to-br from-cyan-950/30 via-zinc-950/80 to-blue-950/20 p-5 shadow-xl shadow-cyan-950/20">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-cyan-300">market context before challenge</div>
          <h2 className="mt-1 text-xl font-bold text-zinc-100">wETH price path from deterministic L2 trades</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            The chart gives viewers a market reason to care before the fraud proof starts: trades move state, state becomes a batch, and a bad batch lies about the result.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400">
          <div className="font-semibold text-zinc-100">Last synthetic wETH</div>
          <div className={direction === "up" ? "text-emerald-300" : "text-red-300"}>${last.toFixed(2)}</div>
          <div className="mt-1 text-xs">{badBatchSeen ? "Bad batch detected" : "No invalidation yet"}</div>
        </div>
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-black/30 p-4">
        <svg viewBox="0 0 100 100" className="h-44 w-full overflow-visible">
          <defs>
            <linearGradient id="weth-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0%" stopColor="#22d3ee" />
              <stop offset="100%" stopColor={badBatchSeen ? "#f87171" : "#34d399"} />
            </linearGradient>
          </defs>
          {[20, 40, 60, 80].map((y) => (
            <line key={y} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeWidth="0.6" />
          ))}
          <polyline fill="none" stroke="url(#weth-line)" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" points={polyline} />
          {points.map((price, index) => {
            const x = (index / Math.max(1, points.length - 1)) * 100;
            const y = 100 - ((price - min) / range) * 78 - 10;
            const trade = trades[index - 1];
            return (
              <motion.circle
                key={`${price}-${index}`}
                cx={x}
                cy={y}
                r={trade?.status === "invalidated" ? 2.6 : 1.8}
                fill={trade?.status === "invalidated" ? "#f87171" : "#67e8f9"}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: index * 0.05 }}
              />
            );
          })}
        </svg>
        <div className="mt-3 grid gap-2 text-xs text-zinc-400 md:grid-cols-3">
          <div className="rounded-lg bg-white/5 p-2">Fast L2 trading creates user-visible price movement.</div>
          <div className="rounded-lg bg-white/5 p-2">The sequencer posts a compressed claim to L1.</div>
          <div className="rounded-lg bg-white/5 p-2">If the claim lies, the challenger forces verification.</div>
        </div>
      </div>
    </section>
  );
}
