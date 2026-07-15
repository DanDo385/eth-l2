"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { batchSwaps } from "../data/opTrackerEducation";
import { useAppStore } from "../lib/store";
import type {
  AppState,
  BatchInfo,
  EventLogEntry,
  ZkInspectPayload,
} from "../types";
import type { LabMode } from "./LabFrame";
import { InfoTip } from "./InfoTip";
import { SwapDetailList } from "./SwapDetailList";

const RECENT_COUNT = 5;

function layerClass(layer: EventLogEntry["layer"]): string {
  if (layer === "L1") return "text-violet-400 border-violet-800/60 bg-violet-950/30";
  if (layer === "L2") return "text-blue-400 border-blue-800/60 bg-blue-950/30";
  return "text-amber-400 border-amber-800/60 bg-amber-950/30";
}

function eventTitle(event: string): string {
  return event.replace(/_/g, " ");
}

function shortHash(h: string): string {
  if (h.length <= 14) return h;
  return `${h.slice(0, 8)}…${h.slice(-4)}`;
}

function weiToEth(wei?: string): string {
  if (!wei) return "-";
  return `${(Number(wei) / 1e18).toFixed(4)} ETH`;
}

function matchesMode(entry: EventLogEntry, mode: LabMode): boolean {
  if (entry.lane === "shared") return true;
  return mode === "optimistic" ? entry.lane === "op" : entry.lane === "zk";
}

function DetailRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="text-zinc-600">{label}</span>
      <span className="min-w-0 break-all text-zinc-300">{children}</span>
    </>
  );
}

function SoliditySnippet({ batch }: { batch: BatchInfo }) {
  const lying = batch.divergence?.lyingSource;
  const honest = batch.divergence?.honestSource;
  if (!lying && !honest) return null;
  return (
    <div className="space-y-1.5 border-t border-zinc-800/80 pt-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
        Solidity at divergence
      </p>
      {lying && (
        <div className="rounded border border-red-900/40 bg-red-950/15 px-2 py-1.5">
          <p className="font-mono text-xs text-red-400/90">
            lying · {lying.file}:{lying.line}
          </p>
          <pre className="mt-1 overflow-x-auto font-mono text-xs leading-relaxed text-red-200/90">
            {lying.lineText || lying.snippet}
          </pre>
        </div>
      )}
      {honest && (
        <div className="rounded border border-emerald-900/40 bg-emerald-950/15 px-2 py-1.5">
          <p className="font-mono text-xs text-emerald-400/90">
            honest · {honest.file}:{honest.line}
          </p>
          <pre className="mt-1 overflow-x-auto font-mono text-xs leading-relaxed text-emerald-200/90">
            {honest.lineText || honest.snippet}
          </pre>
        </div>
      )}
    </div>
  );
}

function OpBatchDetail({ batch }: { batch: BatchInfo }) {
  const swaps = batchSwaps(batch);
  const settle = batch.bondSettlement;
  const verify = batch.verification;
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 font-mono">
        <DetailRow label="engine">{batch.engineType}</DetailRow>
        <DetailRow label="L2 range">
          #{batch.l2StartBlock}-#{batch.l2EndBlock}
        </DetailRow>
        <DetailRow label="tx count">{batch.txCount} swap(s)</DetailRow>
        {batch.status && <DetailRow label="status">{batch.status}</DetailRow>}
        {verify && (
          <DetailRow label="verify cost">{weiToEth(verify.costWei)}</DetailRow>
        )}
        {settle && (
          <>
            <DetailRow label="bond outcome">{settle.outcome}</DetailRow>
            <DetailRow label="payout">{weiToEth(settle.payoutWei)}</DetailRow>
            <DetailRow label="burned">{weiToEth(settle.burnedWei)}</DetailRow>
          </>
        )}
        {batch.divergence && (
          <DetailRow label="opcode">
            {batch.divergence.op}
            {typeof batch.divergence.onchainDivergenceStep === "number"
              ? ` @ step ${batch.divergence.onchainDivergenceStep}`
              : ""}
          </DetailRow>
        )}
      </div>
      <div className="border-t border-zinc-800/80 pt-2">
        <SwapDetailList swaps={swaps} layout="cards" />
      </div>
      <SoliditySnippet batch={batch} />
    </div>
  );
}

function ZkBatchDetail({ zk }: { zk: ZkInspectPayload }) {
  return (
    <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 font-mono">
      {zk.engineType && <DetailRow label="claim">{zk.engineType}</DetailRow>}
      {typeof zk.txCount === "number" && (
        <DetailRow label="tx count">{zk.txCount} swap(s)</DetailRow>
      )}
      <DetailRow label="verify gas">{zk.verifyGas.toLocaleString()}</DetailRow>
      <DetailRow label="prove">{zk.proveMs} ms</DetailRow>
      <DetailRow label="constraints">{zk.constraints.toLocaleString()}</DetailRow>
      <DetailRow label="result">{zk.accepted ? "accepted" : "rejected"}</DetailRow>
      {zk.reason && <DetailRow label="reason">{zk.reason}</DetailRow>}
      {zk.claimedPostRoot && (
        <DetailRow label="claimed root">{shortHash(zk.claimedPostRoot)}</DetailRow>
      )}
      {zk.recomputedRoot && (
        <DetailRow label="recomputed">{shortHash(zk.recomputedRoot)}</DetailRow>
      )}
    </div>
  );
}

function EventDetail({
  entry,
  batch,
  zk,
}: {
  entry: EventLogEntry;
  batch?: BatchInfo;
  zk?: ZkInspectPayload;
}) {
  return (
    <div className="space-y-1.5 border-t border-zinc-800/80 pt-2 text-xs leading-relaxed text-zinc-400">
      <div className="grid grid-cols-[5.5rem_1fr] gap-x-2 gap-y-1 font-mono">
        <DetailRow label="event">{entry.event}</DetailRow>
        <DetailRow label="layer">
          <span className={layerClass(entry.layer).split(" ")[0]}>{entry.layer}</span>
        </DetailRow>
        <DetailRow label="lane">{entry.lane}</DetailRow>
        {entry.chain && <DetailRow label="chain">{entry.chain}</DetailRow>}
        {typeof entry.batchId === "number" && (
          <DetailRow label="batch">#{entry.batchId}</DetailRow>
        )}
        {entry.status && <DetailRow label="status">{entry.status}</DetailRow>}
      </div>
      <p className="text-zinc-500">{entry.summary}</p>
      {batch && entry.lane === "op" && <OpBatchDetail batch={batch} />}
      {zk && entry.lane === "zk" && <ZkBatchDetail zk={zk} />}
    </div>
  );
}

function EventRow({
  entry,
  expanded,
  onToggle,
  batch,
  zk,
}: {
  entry: EventLogEntry;
  expanded: boolean;
  onToggle: () => void;
  batch?: BatchInfo;
  zk?: ZkInspectPayload;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      className={`w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${
        expanded
          ? "border-zinc-600 bg-zinc-900"
          : "border-zinc-800 bg-zinc-950/50 hover:border-zinc-700 hover:bg-zinc-950"
      }`}
    >
      <div className="flex items-start gap-2">
        <span className="shrink-0 font-mono text-xs text-zinc-600">#{entry.seq}</span>
        <span
          className={`shrink-0 rounded border px-1 py-0.5 text-xs font-semibold uppercase tracking-wide ${layerClass(entry.layer)}`}
        >
          {entry.layer}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-zinc-200">
            {eventTitle(entry.event)}
            {typeof entry.batchId === "number" ? (
              <span className="ml-1 font-mono text-zinc-500">· #{entry.batchId}</span>
            ) : null}
          </p>
          {!expanded && (
            <p className="mt-0.5 truncate text-xs text-zinc-500">{entry.summary}</p>
          )}
        </div>
        <span
          aria-hidden="true"
          className={`shrink-0 text-xs text-zinc-600 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        >
          ▾
        </span>
      </div>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="overflow-hidden"
          >
            <EventDetail entry={entry} batch={batch} zk={zk} />
          </motion.div>
        )}
      </AnimatePresence>
    </button>
  );
}

function resolveBatch(state: AppState, entry: EventLogEntry): BatchInfo | undefined {
  if (typeof entry.batchId !== "number") return undefined;
  return state.batches[entry.batchId];
}

function resolveZk(state: AppState, entry: EventLogEntry): ZkInspectPayload | undefined {
  if (typeof entry.batchId !== "number") return undefined;
  return state.zkRollups[entry.batchId];
}

export function EventLogPanel({ mode }: { mode: LabMode }) {
  const { state } = useAppStore();
  const entries = useMemo(
    () => state.eventLog.filter((e) => matchesMode(e, mode)).slice().reverse(),
    [state.eventLog, mode],
  );
  const recent = entries.slice(0, RECENT_COUNT);
  const [expandedSeq, setExpandedSeq] = useState<number | null>(null);
  const [showAll, setShowAll] = useState(false);

  const list = showAll ? entries : entries.slice(0, 12);
  const laneLabel = mode === "optimistic" ? "optimistic" : "ZK";

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <p className="text-xs uppercase tracking-wide text-zinc-500">Event log</p>
            <InfoTip label="About the event log" placement="panel">
              Session events for the {laneLabel} lab only (plus shared L1/session
              messages). Expand a row for swaps, amounts, gas/bond costs, and Solidity
              at the fraud divergence when available.
            </InfoTip>
          </div>
          <p className="mt-0.5 text-sm leading-snug text-zinc-600">
            {laneLabel} lane · click any event for details
          </p>
        </div>
        <span className="shrink-0 font-mono text-xs text-zinc-600">
          {entries.length} event{entries.length === 1 ? "" : "s"}
        </span>
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
          Recent
        </p>
        {recent.length === 0 ? (
          <p className="text-xs text-zinc-600">No events yet - start a demo.</p>
        ) : (
          <div className="grid gap-1 sm:grid-cols-2 xl:grid-cols-5">
            {recent.map((entry, i) => (
              <div
                key={`recent-${entry.seq}-${entry.event}-${entry.chain ?? entry.lane}-${i}`}
                className="flex min-w-0 items-center gap-2 rounded-lg border border-zinc-800/80 bg-zinc-950/40 px-2 py-1.5"
              >
                <span
                  className={`shrink-0 rounded border px-1 py-0.5 text-xs font-semibold uppercase ${layerClass(entry.layer)}`}
                >
                  {entry.layer}
                </span>
                <p className="min-w-0 flex-1 truncate text-xs text-zinc-300">
                  {entry.summary}
                </p>
                <span className="shrink-0 font-mono text-xs text-zinc-600">
                  #{entry.seq}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {entries.length > 0 && (
        <div className="space-y-1.5 border-t border-zinc-800 pt-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              All events
            </p>
            {entries.length > 12 && (
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-xs text-zinc-500 hover:text-zinc-300"
              >
                {showAll ? "Show fewer" : `Show all ${entries.length}`}
              </button>
            )}
          </div>
          <div className="grid max-h-80 gap-1.5 overflow-y-auto pr-0.5 xl:grid-cols-2">
            {list.map((entry, i) => (
              <EventRow
                key={`evt-${entry.seq}-${entry.event}-${entry.chain ?? entry.lane}-${i}`}
                entry={entry}
                expanded={expandedSeq === entry.seq}
                onToggle={() =>
                  setExpandedSeq((cur) => (cur === entry.seq ? null : entry.seq))
                }
                batch={resolveBatch(state, entry)}
                zk={resolveZk(state, entry)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
