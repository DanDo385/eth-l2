"use client";

import type { ReactNode } from "react";
import { DEMO_ACCOUNTS } from "../data/accounts";
import type { SwapSummary } from "../types";

function shortHash(h: string): string {
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

function traderLabel(index: number): string {
  const acct = DEMO_ACCOUNTS[3 + index];
  return acct ? acct.role : `Trader ${index}`;
}

function traderAddr(index: number): string {
  const acct = DEMO_ACCOUNTS[3 + index];
  return acct ? acct.addr : "—";
}

function netDelta(s: SwapSummary): number {
  return s.claimedOut - s.honestOut;
}

interface Props {
  swaps: SwapSummary[];
  /** Compact cards for side panels; table for wider surfaces. */
  layout?: "cards" | "table";
  className?: string;
  /** Optional intro copy under the heading (table layout). */
  note?: string;
  /** Optional lifecycle / status cell for tracker surfaces. */
  renderStatus?: (swap: SwapSummary) => ReactNode;
}

export function SwapDetailList({
  swaps,
  layout = "cards",
  className = "",
  note,
  renderStatus,
}: Props) {
  if (swaps.length === 0) return null;

  if (layout === "table") {
    return (
      <div className={`space-y-2 ${className}`}>
        <p className="text-[10px] font-semibold text-zinc-300">
          Swaps in this batch ({swaps.length})
        </p>
        <p className="text-[9px] leading-relaxed text-zinc-600">
          {note ??
            "Each row is one L2 swap covered by the batch state root. Token A → Token B via SwapRouter. Net is claimed out minus honest out (0 when the sequencer matches)."}
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-[9px]">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-600">
                <th className="py-1 pr-2 text-left">L2</th>
                <th className="py-1 pr-2 text-left">From</th>
                <th className="py-1 pr-2 text-left">Pair</th>
                <th className="py-1 pr-2 text-right">In</th>
                <th className="py-1 pr-2 text-right">Claimed</th>
                <th className="py-1 pr-2 text-right">Honest</th>
                <th className="py-1 pr-2 text-right">Net</th>
                <th className="py-1 pr-2 text-right">Gas</th>
                <th className="py-1 pr-2 text-left">Tx</th>
                {renderStatus && <th className="py-1 text-left">Status</th>}
              </tr>
            </thead>
            <tbody>
              {swaps.map((s, i) => {
                const delta = netDelta(s);
                return (
                  <tr
                    key={`${s.txHash}-${i}`}
                    className={`border-b border-zinc-800/60 ${
                      s.isDivergent ? "bg-red-950/20" : ""
                    }`}
                  >
                    <td className="py-1.5 pr-2 font-mono text-zinc-400">#{s.l2Block}</td>
                    <td className="py-1.5 pr-2 text-zinc-300" title={traderAddr(s.traderIndex)}>
                      {traderLabel(s.traderIndex)}
                      {s.isDivergent && (
                        <span className="ml-1 text-red-400" title="Fraud proof isolates this swap">
                          ✦
                        </span>
                      )}
                      <span className="mt-0.5 block font-mono text-[8px] text-zinc-600">
                        {shortHash(traderAddr(s.traderIndex))}
                      </span>
                    </td>
                    <td className="py-1.5 pr-2 text-zinc-500">A→B</td>
                    <td className="py-1.5 pr-2 text-right font-mono text-zinc-400">
                      {s.amountIn}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right font-mono ${
                        delta !== 0 ? "text-red-300" : "text-zinc-400"
                      }`}
                    >
                      {s.claimedOut}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-emerald-400/80">
                      {s.honestOut}
                    </td>
                    <td
                      className={`py-1.5 pr-2 text-right font-mono ${
                        delta > 0
                          ? "text-red-300"
                          : delta < 0
                            ? "text-amber-300"
                            : "text-zinc-600"
                      }`}
                    >
                      {delta > 0 ? `+${delta}` : delta}
                    </td>
                    <td className="py-1.5 pr-2 text-right font-mono text-zinc-500">
                      {s.gasUsed != null && s.gasUsed > 0 ? s.gasUsed.toLocaleString() : "—"}
                    </td>
                    <td className="py-1.5 pr-2 font-mono text-zinc-500" title={s.txHash}>
                      {shortHash(s.txHash)}
                    </td>
                    {renderStatus && <td className="py-1.5">{renderStatus(s)}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-1.5 ${className}`}>
      <p className="text-[9px] font-semibold uppercase tracking-wide text-zinc-600">
        Swaps ({swaps.length})
      </p>
      <p className="text-[9px] leading-relaxed text-zinc-600">
        Token A → Token B through SwapRouter. One state root covers every swap below.
      </p>
      <div className="space-y-2">
        {swaps.map((s, i) => {
          const delta = netDelta(s);
          return (
            <div
              key={`${s.txHash}-${i}`}
              className={`rounded border px-2 py-1.5 font-mono text-[9px] leading-relaxed ${
                s.isDivergent
                  ? "border-red-900/50 bg-red-950/20"
                  : "border-zinc-800/80 bg-zinc-950/40"
              }`}
            >
              <div className="grid grid-cols-[4.75rem_1fr] gap-x-2 gap-y-0.5">
                <span className="text-zinc-600">type</span>
                <span className="text-zinc-300">
                  swap Token A → Token B
                  {s.isDivergent && (
                    <span className="ml-1 text-red-400" title="Fraud proof isolates this swap">
                      ✦ divergent
                    </span>
                  )}
                </span>
                <span className="text-zinc-600">from</span>
                <span className="text-zinc-300" title={traderAddr(s.traderIndex)}>
                  {traderLabel(s.traderIndex)} · {shortHash(traderAddr(s.traderIndex))}
                </span>
                <span className="text-zinc-600">to</span>
                <span className="text-zinc-300">SwapRouter (L2)</span>
                <span className="text-zinc-600">amount in</span>
                <span className="text-zinc-300">{s.amountIn} Token A</span>
                <span className="text-zinc-600">claimed out</span>
                <span className={delta !== 0 ? "text-red-300" : "text-zinc-300"}>
                  {s.claimedOut} Token B
                </span>
                <span className="text-zinc-600">honest out</span>
                <span className="text-emerald-400/80">{s.honestOut} Token B</span>
                <span className="text-zinc-600">net</span>
                <span
                  className={
                    delta > 0
                      ? "text-red-300"
                      : delta < 0
                        ? "text-amber-300"
                        : "text-zinc-500"
                  }
                >
                  {delta > 0 ? `+${delta}` : delta} Token B
                  {delta !== 0 ? " vs honest" : ""}
                </span>
                {s.gasUsed != null && s.gasUsed > 0 && (
                  <>
                    <span className="text-zinc-600">gas</span>
                    <span className="text-zinc-300">{s.gasUsed.toLocaleString()}</span>
                  </>
                )}
                <span className="text-zinc-600">tx</span>
                <span className="break-all text-zinc-400" title={s.txHash}>
                  {shortHash(s.txHash)}
                </span>
                <span className="text-zinc-600">L2 block</span>
                <span className="text-zinc-300">#{s.l2Block}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
