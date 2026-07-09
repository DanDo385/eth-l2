"use client";

import { useAppStore } from "../lib/store";
import { safeNum } from "../lib/numbers";
import type { AppState } from "../types";
import {
  CHALLENGE_WINDOW_SECONDS,
  OPTIMISTIC_SUSPICION_PROBABILITY,
  ZK_SUSPICION_PROBABILITY,
} from "../data/protocol";
import { ZkContrastStrip } from "./ZkContrastStrip";
import { InfoTip } from "./InfoTip";

function scoreNums(sb: AppState["scoreboard"]) {
  return {
    zkBatches: safeNum(sb.zkBatches),
    zkAccepted: safeNum(sb.zkAccepted),
    zkRejected: safeNum(sb.zkRejected),
  };
}

function Metric({
  label,
  value,
  valueClass = "text-zinc-300",
  title,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
  title?: string;
}) {
  return (
    <div
      title={title}
      className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-2.5 py-2"
    >
      <p className="text-[9px] leading-tight text-zinc-500">{label}</p>
      <p className={`mt-0.5 font-mono text-sm tabular-nums ${valueClass}`}>{value}</p>
    </div>
  );
}

interface Props {
  mode?: "all" | "optimistic" | "zk";
}

export function Scoreboard({ mode = "all" }: Props) {
  const { state } = useAppStore();
  const showOp = mode === "all" || mode === "optimistic";
  const showZk = mode === "all" || mode === "zk";
  const { zkBatches, zkAccepted, zkRejected } = scoreNums(state.scoreboard);

  const batchList = Object.values(state.batches);
  const opBatches = batchList.length;
  const honest = batchList.filter((b) => b.engineType === "honest").length;
  const fraud = batchList.filter(
    (b) => b.engineType === "obvious" || b.engineType === "subtle",
  ).length;
  const flagged = batchList.filter((b) => b.flagged).length;
  const verifiedMismatch = batchList.filter(
    (b) => b.verification?.result === "verified_mismatch",
  ).length;
  const inDispute = batchList.filter((b) => b.challenged && !b.resolved).length;
  const resolved = batchList.filter((b) => b.resolved).length;
  const flaggedFraud = batchList.filter(
    (b) => b.engineType !== "honest" && (b.flagged || b.challenged || b.resolved),
  ).length;
  const flagRate = fraud > 0 ? Math.round((flaggedFraud / fraud) * 100) : 0;
  const resolutionRate = fraud > 0 ? Math.round((resolved / fraud) * 100) : 0;

  return (
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-zinc-500">Scoreboard</p>
        {showOp && (
          <div className="flex items-center gap-3 font-mono text-[10px]">
            <span title="Watcher flag rate on fraudulent batches">
              <span className="text-zinc-600">Watcher flagged </span>
              <span className="text-yellow-400">{flagRate}%</span>
            </span>
            <span title="Fraud resolved on L1 after user challenge">
              <span className="text-zinc-600">Fraud resolved on L1 </span>
              <span className="text-emerald-400">{resolutionRate}%</span>
            </span>
            <InfoTip label="About watcher vs resolution rates" placement="panel">
              Flagging reaches 100% because this demo&apos;s honest watcher replays every
              batch. Resolution only rises when a user verifies and challenges — detection
              alone rejects nothing on L1.
            </InfoTip>
          </div>
        )}
      </div>

      <div
        className={
          showOp && showZk ? "grid gap-4 md:grid-cols-2" : "grid gap-3"
        }
      >
        {showOp && (
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-xs font-semibold text-blue-400">OP: Optimistic</p>
              <p className="text-[9px] text-zinc-600">Trust first, prove fraud after</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 lg:grid-cols-4">
              <Metric
                label="Batches posted"
                value={opBatches}
                title="Total batches posted to L1 by the sequencer"
              />
              <Metric
                label="Honest"
                value={honest}
                valueClass="text-emerald-400"
                title="Batches where state root matched honest replay"
              />
              <Metric
                label="Fraudulent"
                value={fraud}
                valueClass="text-red-400"
                title="Batches using a lying swap engine"
              />
              <Metric
                label="Flagged"
                value={flagged}
                valueClass="text-yellow-400"
                title="Batches flagged by the honest watcher"
              />
              <Metric
                label="Verified mismatch"
                value={verifiedMismatch}
                valueClass="text-orange-400"
                title="Batches where user verification found a mismatch"
              />
              <Metric
                label="In dispute"
                value={inDispute}
                valueClass="text-orange-400"
                title="Challenges currently open on L1"
              />
              <Metric
                label="Resolved fraud"
                value={resolved}
                valueClass="text-red-400"
                title="Disputes finished — sequencer lost bond, batch rejected"
              />
            </div>
            <p className="text-[10px] leading-snug text-zinc-600">
              Fault rate ~1 in {Math.round(1 / OPTIMISTIC_SUSPICION_PROBABILITY)}. Suspicious
              roots wait for you to verify and challenge during the{" "}
              {CHALLENGE_WINDOW_SECONDS}s window.
            </p>
          </div>
        )}

        {showZk && (
          <div className="min-w-0 space-y-2">
            <div className="flex items-baseline gap-2">
              <p className="text-xs font-semibold text-emerald-400">ZK: Validity</p>
              <p className="text-[9px] text-zinc-600">Prove first, accept after</p>
            </div>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              <Metric
                label="Submitted"
                value={zkBatches}
                title="Total ZK batches submitted with a proof"
              />
              <Metric
                label="Verified"
                value={zkAccepted}
                valueClass="text-emerald-400"
                title="Proofs the L1 verifier accepted"
              />
              <Metric
                label="Rejected"
                value={zkRejected}
                valueClass="text-red-400"
                title="Invalid proofs rejected at submission"
              />
              <Metric
                label="Challenge window"
                value="0"
                valueClass="text-emerald-400"
                title="ZK batches are final the moment the proof verifies"
              />
            </div>
            <p className="text-[10px] leading-snug text-zinc-600">
              Invalid claims ~1 in {Math.round(1 / ZK_SUSPICION_PROBABILITY)}. They fail at
              proof verification, not through a fraud-proof game.
            </p>
          </div>
        )}
      </div>

      {showZk && <ZkContrastStrip />}
    </div>
  );
}
