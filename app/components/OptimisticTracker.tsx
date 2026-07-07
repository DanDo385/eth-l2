"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../lib/store";
import { batchStatus } from "../data/batchEducation";
import {
  MAINNET_SIMPLIFICATIONS,
  batchPipelineStage,
  batchSwaps,
  finalityImpact,
  l1ImpactLines,
  rerouteNarrative,
  swapLifecycleStatus,
  swapStatusColor,
  swapStatusLabel,
} from "../data/opTrackerEducation";
import { batchEconomicEvents, computeBondLedger, fraudBatches } from "../lib/opLedger";
import type { BatchInfo, SourceLoc } from "../types";
import { BATCH_WINDOW, CHALLENGE_WINDOW_SECONDS, PORTAL_BOND_ETH } from "../data/protocol";

function shortHash(h: string) {
  return h.length > 14 ? h.slice(0, 8) + "…" + h.slice(-4) : h;
}

function shortFile(file: string) {
  return file.split("/").slice(-2).join("/");
}

function SourceLineCard({
  source,
  label,
  tone,
}: {
  source: SourceLoc;
  label: string;
  tone: "honest" | "lying";
}) {
  const classes =
    tone === "honest"
      ? "border-emerald-900/50 bg-emerald-950/10 text-emerald-200"
      : "border-red-800/60 bg-red-950/20 text-red-200";
  const labelClass = tone === "honest" ? "text-emerald-400/90" : "text-red-400/90";

  return (
    <div className={`rounded-lg border p-2.5 ${classes}`}>
      <p className={`mb-1 text-[10px] font-mono ${labelClass}`}>
        {shortFile(source.file)}:{source.line} — {label}
      </p>
      <pre className="whitespace-pre-wrap break-words text-[11px] leading-relaxed font-mono">
        {source.lineText}
      </pre>
    </div>
  );
}

function FraudSourceExhibit({ batch }: { batch: BatchInfo }) {
  const divergence = batch.divergence;
  if (!divergence?.lyingSource && !divergence?.honestSource) return null;

  return (
    <div className="rounded-lg border border-red-900/50 bg-red-950/10 p-3 space-y-2">
      <div>
        <p className="text-[10px] font-semibold text-red-400">
          Solidity source line that caused the bad root
        </p>
        <p className="text-[10px] text-zinc-500 leading-relaxed mt-0.5">
          FraudProofGame bisects the committed trace, re-executes one step on L1,
          then the UI resolves that bytecode position back to the deployed source map.
        </p>
      </div>

      {divergence.honestSource && (
        <SourceLineCard source={divergence.honestSource} label="honest engine" tone="honest" />
      )}
      {divergence.lyingSource && (
        <SourceLineCard source={divergence.lyingSource} label="this batch's engine" tone="lying" />
      )}

      {typeof divergence.onchainDivergenceStep === "number" && (
        <p className="text-[9px] font-mono text-zinc-600">
          on-chain one-step proof isolated VM step #{divergence.onchainDivergenceStep}
        </p>
      )}
    </div>
  );
}

function BatchChip({
  batch,
  selected,
  onClick,
}: {
  batch: BatchInfo;
  selected: boolean;
  onClick: () => void;
}) {
  const status = batchStatus(batch);
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-lg border px-2.5 py-1.5 text-left transition-all hover:brightness-110 ${status.border} ${status.bg} ${
        selected ? "ring-2 ring-zinc-300 ring-offset-1 ring-offset-zinc-950" : ""
      }`}
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-semibold text-zinc-200">#{batch.batchId}</span>
        <span className="text-[9px] text-zinc-400">{status.short}</span>
        {batch.engineType !== "honest" && (
          <span className="text-[8px] px-1 rounded bg-red-900/40 text-red-300 border border-red-800">
            {batch.engineType}
          </span>
        )}
      </div>
      <p className="text-[8px] text-zinc-500 mt-0.5 font-mono">
        L2 {batch.l2StartBlock}–{batch.l2EndBlock} · {batch.txCount} swap{batch.txCount === 1 ? "" : "s"}
      </p>
    </button>
  );
}

/**
 * Dispute phase for the reroute diagram. Only "rejected" (fraud proven on L1)
 * may show rollback/slash outcomes — a watcher flag is off-chain detection,
 * not an L1 rejection, and a live challenge has no outcome yet.
 */
function reroutePhase(batch: BatchInfo): "rejected" | "disputing" | "flagged" | "open" {
  if (batch.resolved) return "rejected";
  if (batch.challenged) return "disputing";
  if (batch.flagged) return "flagged";
  return "open";
}

function RerouteDiagram({ batch, swaps }: { batch: BatchInfo; swaps: ReturnType<typeof batchSwaps> }) {
  const good = swaps.filter((s) => !s.isDivergent);
  const bad = swaps.filter((s) => s.isDivergent);
  const nextId = batch.batchId + 1;
  const phase = reroutePhase(batch);

  const sourceBox =
    phase === "rejected"
      ? "border-red-800 bg-red-950/20"
      : phase === "disputing"
        ? "border-orange-800 bg-orange-950/20"
        : phase === "flagged"
          ? "border-yellow-800 bg-yellow-950/20"
          : "border-blue-800 bg-blue-950/20";

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950/60 p-3 space-y-3">
      <p className="text-[10px] font-semibold text-zinc-300 uppercase tracking-wide">
        Batch rollback &amp; re-sequencing
      </p>

      <div className="flex flex-col sm:flex-row items-stretch gap-2 text-[9px]">
        {/* Source batch */}
        <div className={`flex-1 rounded border p-2 space-y-1 ${sourceBox}`}>
          <p className="font-semibold text-zinc-300">Batch #{batch.batchId}</p>
          <p className="text-zinc-500">Blocks {batch.l2StartBlock}→{batch.l2EndBlock}</p>
          <div className="flex flex-wrap gap-1 pt-1">
            {swaps.map((s, i) => (
              <span
                key={i}
                className={`px-1 py-0.5 rounded border font-mono ${
                  s.isDivergent
                    ? "border-red-600 bg-red-950/50 text-red-300"
                    : "border-violet-700 bg-violet-950/30 text-violet-300"
                }`}
                title={s.isDivergent ? "Fraud proof target" : "Valid swap intent"}
              >
                blk{s.l2Block}
              </span>
            ))}
          </div>
          {phase === "rejected" && (
            <p className="text-red-400 font-semibold pt-1">✗ L1 rejects root</p>
          )}
          {phase === "disputing" && (
            <p className="text-orange-400 font-semibold pt-1">⚖ Challenge live on L1</p>
          )}
          {phase === "flagged" && (
            <p className="text-yellow-400 font-semibold pt-1">⚠ Flagged off-chain only</p>
          )}
        </div>

        <div className="flex items-center justify-center text-zinc-600 text-lg shrink-0">→</div>

        {/* Outcomes */}
        <div className="flex-1 space-y-2">
          {phase === "rejected" && (
            <>
              {bad.length > 0 && (
                <div className="rounded border border-red-900/60 bg-red-950/10 p-2">
                  <p className="text-red-400 font-semibold">{bad.length} fraudulent</p>
                  <p className="text-zinc-500 mt-0.5">
                    State transition discarded. Bond slashed; proof recorded on L1.
                  </p>
                </div>
              )}
              {good.length > 0 && (
                <div className="rounded border border-violet-800 bg-violet-950/20 p-2">
                  <p className="text-violet-300 font-semibold">
                    {good.length}/{swaps.length} good swap{good.length === 1 ? "" : "s"}
                  </p>
                  <p className="text-zinc-500 mt-0.5">
                    Re-included in batch #{nextId} (next {BATCH_WINDOW}-block window) with honest execution.
                  </p>
                  <div className="flex flex-wrap gap-1 pt-1">
                    {good.map((s, i) => (
                      <span
                        key={i}
                        className="px-1 py-0.5 rounded border border-violet-600 bg-violet-950/40 text-violet-200 font-mono"
                      >
                        → #{nextId}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {phase === "disputing" && (
            <div className="rounded border border-orange-800 bg-orange-950/10 p-2">
              <p className="text-orange-400 font-semibold">Dispute in progress</p>
              <p className="text-zinc-500 mt-0.5">
                Both bonds are locked while FraudProofGame narrows the trace. No rollback
                happens unless the challenger wins the one-step proof.
              </p>
            </div>
          )}
          {phase === "flagged" && (
            <div className="rounded border border-yellow-800 bg-yellow-950/10 p-2">
              <p className="text-yellow-400 font-semibold">Nothing rejected on L1 yet</p>
              <p className="text-zinc-500 mt-0.5">
                The watcher's flag is off-chain detection. A participant must verify locally
                and post a challenge bond before L1 can reject this root.
              </p>
            </div>
          )}
          {phase === "open" && batch.engineType === "honest" && (
            <div className="rounded border border-emerald-800 bg-emerald-950/20 p-2">
              <p className="text-emerald-400 font-semibold">All canonical</p>
              <p className="text-zinc-500">No rollback — root matches honest replay.</p>
            </div>
          )}
          {phase === "open" && batch.engineType !== "honest" && (
            <div className="rounded border border-blue-800 bg-blue-950/20 p-2">
              <p className="text-blue-300 font-semibold">Challenge window open</p>
              <p className="text-zinc-500 mt-0.5">
                If fraud is proven later, every swap here rolls back together.
              </p>
            </div>
          )}
        </div>
      </div>

      <p className="text-[10px] text-zinc-500 leading-relaxed border-l-2 border-zinc-700 pl-2">
        {rerouteNarrative(batch, swaps)}
      </p>
    </div>
  );
}

function PipelineBar({ batch }: { batch: BatchInfo }) {
  const { stage, detail, pct } = batchPipelineStage(batch);
  const steps = ["Posted", "Window", "Flagged", "Dispute", "Outcome"];
  let active = 1;
  if (batch.flagged) active = 3;
  if (batch.challenged) active = 4;
  if (batch.resolved || batch.finalized) active = 5;

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-[10px]">
        <span className="text-zinc-400 font-semibold">{stage}</span>
        <span className="text-zinc-600">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-zinc-800 overflow-hidden">
        <motion.div
          className={`h-full rounded-full ${
            batch.resolved ? "bg-red-500" : batch.finalized ? "bg-emerald-500" : "bg-blue-500"
          }`}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>
      <div className="flex justify-between gap-1">
        {steps.map((label, i) => (
          <span
            key={label}
            className={`text-[8px] flex-1 text-center ${
              i + 1 <= active ? "text-zinc-300" : "text-zinc-700"
            }`}
          >
            {label}
          </span>
        ))}
      </div>
      <p className="text-[10px] text-zinc-500 leading-relaxed">{detail}</p>
    </div>
  );
}

interface Props {
  onBatchClick: (batchId: number) => void;
  onShowOpcodeRace?: (batchId: number) => void;
}

export function OptimisticTracker({ onBatchClick, onShowOpcodeRace }: Props) {
  const { state, dispatch } = useAppStore();
  const batches = useMemo(
    () => Object.values(state.batches).sort((a, b) => b.batchId - a.batchId),
    [state.batches],
  );
  const fraudList = useMemo(() => fraudBatches(batches), [batches]);
  const bondLedger = useMemo(() => computeBondLedger(batches), [batches]);

  const selectedId = state.inspectedBatch ?? batches[0]?.batchId ?? null;
  const selected = selectedId !== null ? state.batches[selectedId] : null;
  const swaps = selected ? batchSwaps(selected) : [];
  const ledger = selected ? batchEconomicEvents(selected) : [];
  const finality = selected ? finalityImpact(selected) : null;
  const l1Lines = selected ? l1ImpactLines(selected) : [];

  const [, tick] = useState(0);
  useEffect(() => {
    if (!state.running) return;
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [state.running]);

  if (!state.running && batches.length === 0) {
    return (
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4">
        <p className="text-xs text-zinc-500 uppercase tracking-wide mb-2">
          Optimistic rollup lifecycle
        </p>
        <p className="text-[11px] text-zinc-600 leading-relaxed">
          Start a simulation to track every OP batch here — including batches that scroll off the
          canvas. Swaps, L1 bonds, rollbacks, and balance changes stay visible for the whole session.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">
            Optimistic rollup lifecycle
          </p>
          <p className="text-[10px] text-zinc-600 mt-0.5 max-w-prose">
            Full session history — batches never disappear when they leave the canvas window.
            Suspicious roots wait here until the user verifies locally and chooses whether to challenge.
          </p>
        </div>
        <div className="text-[10px] font-mono text-zinc-500 space-y-0.5 text-right">
          <p>{batches.length} batch{batches.length === 1 ? "" : "es"} tracked</p>
          <p className="text-red-400">{fraudList.length} fraud record{fraudList.length === 1 ? "" : "s"}</p>
        </div>
      </div>

      {/* Demo simplifications, visible before the detail — full list stays in the footer */}
      <div className="flex flex-wrap items-center gap-1.5 text-[9px]">
        <span className="font-semibold uppercase tracking-wide text-zinc-600">
          Demo simplifications:
        </span>
        {[
          [`${CHALLENGE_WINDOW_SECONDS}s window`, "Compressed from ~7 days on OP Mainnet so you can watch finality."],
          [`${BATCH_WINDOW}-block batches`, "Fixed batch cadence; production sequencers vary."],
          [`${PORTAL_BOND_ETH} ETH bonds`, "Equal fixed bonds for sequencer and challenger; production bond rules vary."],
          ["tiny swap-VM proof", "Bisection to one instruction, scaled down from production fault-proof VMs."],
          ["honest watcher", "Always flags mismatches; real systems rely on at least one honest monitor."],
        ].map(([chip, why]) => (
          <span
            key={chip}
            title={why}
            className="cursor-help rounded border border-zinc-800 bg-zinc-950/60 px-1.5 py-0.5 text-zinc-400"
          >
            {chip}
          </span>
        ))}
      </div>

      <p className="rounded border border-zinc-800 bg-zinc-950/40 px-2 py-1.5 text-[10px] leading-relaxed text-zinc-500">
        <span className="font-semibold text-zinc-400">Glossary:</span> in this lab,
        &ldquo;output root&rdquo;, &ldquo;state root&rdquo;, and &ldquo;assertion&rdquo; all refer to
        the sequencer&rsquo;s posted commitment to the L2 state after a batch. Production rollups may
        wrap more data into an output root.
      </p>

      {/* Batch timeline strip */}
      {batches.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] text-zinc-500 font-semibold">All batches (newest first)</p>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {batches.map((b) => (
              <BatchChip
                key={b.batchId}
                batch={b}
                selected={b.batchId === selectedId}
                onClick={() => {
                  onBatchClick(b.batchId);
                  dispatch({ type: "INSPECT_BATCH", batchId: b.batchId });
                }}
              />
            ))}
          </div>
        </div>
      )}

      <AnimatePresence mode="wait">
        {selected && (
          <motion.div
            key={selected.batchId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-4 border-t border-zinc-800 pt-4"
          >
            {/* Left column: pipeline + swaps + reroute */}
            <div className="space-y-4">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3">
                <p className="text-[10px] font-semibold text-blue-400 mb-2">
                  Batch #{selected.batchId} pipeline
                </p>
                <PipelineBar batch={selected} />
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-zinc-300">
                  Swaps in this batch ({swaps.length})
                </p>
                <p className="text-[9px] text-zinc-600 leading-relaxed">
                  One state root covers every swap below. If any transition is wrong, the entire batch
                  is invalid — {swaps.filter((s) => !s.isDivergent).length} good swap
                  {swaps.filter((s) => !s.isDivergent).length === 1 ? "" : "s"} still roll back with it.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-[9px]">
                    <thead>
                      <tr className="text-zinc-600 border-b border-zinc-800">
                        <th className="text-left py-1 pr-2">L2 blk</th>
                        <th className="text-left py-1 pr-2">Trader</th>
                        <th className="text-right py-1 pr-2">In</th>
                        <th className="text-right py-1 pr-2">Out (claimed)</th>
                        <th className="text-right py-1 pr-2">Honest</th>
                        <th className="text-left py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {swaps.map((s, i) => {
                        const st = swapLifecycleStatus(selected, s);
                        return (
                          <tr key={i} className="border-b border-zinc-800/60">
                            <td className="py-1.5 pr-2 font-mono text-zinc-400">{s.l2Block}</td>
                            <td className="py-1.5 pr-2 text-zinc-300">
                              T{s.traderIndex}
                              {s.isDivergent && (
                                <span className="ml-1 text-red-400" title="Fraud proof isolates this swap">
                                  ⚡
                                </span>
                              )}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono text-zinc-400">
                              {s.amountIn}
                            </td>
                            <td
                              className={`py-1.5 pr-2 text-right font-mono ${
                                s.claimedOut !== s.honestOut ? "text-red-300" : "text-zinc-400"
                              }`}
                            >
                              {s.claimedOut}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono text-emerald-400/80">
                              {s.honestOut}
                            </td>
                            <td className="py-1.5">
                              <span
                                className={`inline-block px-1 py-0.5 rounded border text-[8px] ${swapStatusColor(st)}`}
                              >
                                {swapStatusLabel(st)}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-[8px] font-mono text-zinc-700 truncate" title={swaps[0]?.txHash}>
                  tx: {swaps[0] ? shortHash(swaps[0].txHash) : "—"}
                  {swaps.length > 1 ? ` (+${swaps.length - 1} more)` : ""}
                </p>
              </div>

              <RerouteDiagram batch={selected} swaps={swaps} />

              {selected.resolved && selected.divergence && onShowOpcodeRace && (
                <button
                  type="button"
                  onClick={() => onShowOpcodeRace(selected.batchId)}
                  className="w-full btn-green text-xs"
                >
                  Walk opcode proof for batch #{selected.batchId} ↗
                </button>
              )}
            </div>

            {/* Right column: L1, finality, ledger, fraud log */}
            <div className="space-y-4">
              <FraudSourceExhibit batch={selected} />

              {finality && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-amber-400">Finality impact</p>
                  <p className="text-sm font-semibold text-zinc-200">{finality.label}</p>
                  {finality.blocksDelayed > 0 && (
                    <p className="text-[10px] text-orange-400 font-mono">
                      ~{finality.blocksDelayed} L2 block{finality.blocksDelayed === 1 ? "" : "s"} delayed
                    </p>
                  )}
                  <p className="text-[10px] text-zinc-500 leading-relaxed">{finality.explanation}</p>
                </div>
              )}

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-violet-400">L1 portal activity</p>
                <ul className="space-y-1.5">
                  {l1Lines.map((line, i) => (
                    <li
                      key={i}
                      className="text-[10px] text-zinc-400 leading-snug flex gap-2"
                    >
                      <span className="text-violet-600 shrink-0">{i + 1}.</span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950/40 p-3 space-y-2">
                <p className="text-[10px] font-semibold text-emerald-400">Balance, collateral &amp; bond ledger</p>
                <div className="overflow-x-auto max-h-56 overflow-y-auto">
                  <table className="w-full text-[9px]">
                    <thead className="sticky top-0 bg-zinc-950">
                      <tr className="text-zinc-600 border-b border-zinc-800">
                        <th className="text-left py-1 pr-2">#</th>
                        <th className="text-left py-1 pr-2">Event</th>
                        <th className="text-left py-1 pr-2">Layer</th>
                        <th className="text-left py-1 pr-2">Payer → receiver</th>
                        <th className="text-right py-1 pr-2">Amount</th>
                        <th className="text-left py-1">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((line, i) => (
                        <tr key={i} className="border-b border-zinc-800/40">
                          <td className="py-1.5 pr-2 font-mono text-zinc-500">{line.sequence}</td>
                          <td className="py-1.5 pr-2">
                            <span className="text-zinc-300">{line.eventName}</span>
                            <p className="text-[8px] text-zinc-600 leading-tight">{line.explanation}</p>
                          </td>
                          <td className="py-1.5 pr-2 font-mono text-zinc-400">{line.layer}</td>
                          <td className="py-1.5 pr-2 text-zinc-400">
                            {line.payer} → {line.receiver}
                          </td>
                          <td className={`py-1.5 pr-2 text-right font-mono ${line.amount.startsWith("+") ? "text-emerald-400" : line.amount.startsWith("-") ? "text-red-300" : "text-zinc-400"}`}>
                            {line.amount} {line.asset}
                          </td>
                          <td className="py-1.5">
                            <span className="rounded border border-zinc-700 bg-zinc-900 px-1 py-0.5 text-zinc-300">
                              {line.before} → {line.after}
                            </span>
                            <p className="text-[8px] text-zinc-600 mt-0.5">{line.fundStatus}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="border-t border-zinc-800 pt-2 grid grid-cols-2 gap-2 text-[9px]">
                  <div>
                    <p className="text-zinc-500">Sequencer bonds</p>
                    <p className="font-mono text-zinc-300">
                      posted {bondLedger.sequencer.posted.toFixed(2)} ETH
                    </p>
                    <p className="font-mono text-emerald-400">
                      returned {bondLedger.sequencer.returned.toFixed(2)}
                    </p>
                    <p className="font-mono text-red-400">
                      slashed {bondLedger.sequencer.slashed.toFixed(2)}
                    </p>
                  </div>
                  <div>
                    <p className="text-zinc-500">Challenger</p>
                    <p className="font-mono text-zinc-300">
                      posted {bondLedger.challenger.posted.toFixed(2)} ETH
                    </p>
                    <p className="font-mono text-emerald-400">
                      won {bondLedger.challenger.won.toFixed(2)} · returned {bondLedger.challenger.returned.toFixed(2)}
                    </p>
                    <p className="font-mono text-red-400">
                      lost/slashed {bondLedger.challenger.lost.toFixed(2)}
                    </p>
                  </div>
                </div>
              </div>

              {fraudList.length > 0 && (
                <div className="rounded-lg border border-red-900/50 bg-red-950/10 p-3 space-y-2">
                  <p className="text-[10px] font-semibold text-red-400">
                    Fraud record (session)
                  </p>
                  <ul className="space-y-2 max-h-36 overflow-y-auto">
                    {fraudList.map((b) => {
                      const st = batchStatus(b);
                      return (
                        <li key={b.batchId}>
                          <button
                            type="button"
                            onClick={() => {
                              onBatchClick(b.batchId);
                              dispatch({ type: "INSPECT_BATCH", batchId: b.batchId });
                            }}
                            className="w-full text-left rounded border border-red-900/40 bg-red-950/20 px-2 py-1.5 hover:bg-red-950/40"
                          >
                            <span className="text-[10px] font-semibold text-red-300">
                              Batch #{b.batchId} · {b.engineType}
                            </span>
                            <p className="text-[9px] text-zinc-500 mt-0.5">{st.explanation}</p>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Simplifications footer */}
      <details className="border-t border-zinc-800 pt-3 group">
        <summary className="text-[10px] text-zinc-500 cursor-pointer hover:text-zinc-400 list-none flex items-center gap-2">
          <span className="group-open:rotate-90 transition-transform">▶</span>
          Simplifications vs mainnet ({MAINNET_SIMPLIFICATIONS.length} items)
        </summary>
        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {MAINNET_SIMPLIFICATIONS.map((item) => (
            <div
              key={item.title}
              className="rounded border border-zinc-800 bg-zinc-950/50 p-2.5 text-[9px] space-y-1"
            >
              <p className="font-semibold text-zinc-300">{item.title}</p>
              <div className="flex gap-3 font-mono">
                <span className="text-blue-400">sim: {item.sim}</span>
                <span className="text-zinc-600">mainnet: {item.mainnet}</span>
              </div>
              <p className="text-zinc-600 leading-relaxed">{item.note}</p>
            </div>
          ))}
        </div>
        <p className="text-[9px] text-zinc-700 mt-2 leading-relaxed">
          Bonds are {PORTAL_BOND_ETH} ETH per post/challenge in this lab. Production rollups use
          similar economics at larger scale — the challenger must be right or they lose their bond too.
        </p>
      </details>
    </div>
  );
}
