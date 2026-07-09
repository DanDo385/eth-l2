"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAppStore } from "../lib/store";
import { apiPost } from "../lib/ws";
import {
  batchStatus,
  batchWindowNote,
  bondSettlementNote,
  challengeWindowNote,
  engineExplanation,
} from "../data/batchEducation";
import { batchSwaps } from "../data/opTrackerEducation";
import { PORTAL_BOND_ETH } from "../data/protocol";
import { decodeWord, opHeadline, slotMeaning } from "../data/traceNarrative";
import { SwapDetailList } from "./SwapDetailList";

function hex(s: string) {
  return s.length > 18 ? s.slice(0, 10) + "…" + s.slice(-6) : s;
}

function weiToEth(wei?: string) {
  if (!wei) return "0.00";
  return (Number(wei) / 1e18).toFixed(2);
}

function engineBadge(type: string) {
  switch (type) {
    case "honest":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-emerald-900/50 text-emerald-400 border border-emerald-700">
          honest
        </span>
      );
    case "obvious":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-red-900/50 text-red-400 border border-red-700">
          obvious lie
        </span>
      );
    case "subtle":
      return (
        <span className="px-1.5 py-0.5 rounded text-xs bg-orange-900/50 text-orange-400 border border-orange-700">
          subtle lie
        </span>
      );
    default:
      return null;
  }
}

interface Props {
  onShowOpcodeRace: (batchId: number) => void;
}

export function BlockInspector({ onShowOpcodeRace }: Props) {
  const { state, dispatch, refreshState } = useAppStore();
  const batchId = state.inspectedBatch;
  const batch = batchId !== null ? state.batches[batchId] : null;
  const status = batch ? batchStatus(batch) : null;
  const [, tick] = useState(0);

  useEffect(() => {
    if (!batch || batch.finalized || batch.challenged || batch.flagged) return;
    const timer = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(timer);
  }, [batch]);

  useEffect(() => {
    if (batchId === null) return;
    void refreshState();
  }, [batchId, refreshState]);

  useEffect(() => {
    if (batchId === null || !batch || batch.resolved || !batch.flagged) return;
    const timer = setInterval(() => {
      void refreshState();
    }, 1500);
    return () => clearInterval(timer);
  }, [batchId, batch?.flagged, batch?.challenged, batch?.resolved, refreshState]);

  async function handleChallenge() {
    if (!batch) return;
    try {
      await apiPost("/api/challenge", { batchId: batch.batchId });
      await refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Challenge failed";
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    }
  }

  async function handleVerify() {
    if (!batch) return;
    try {
      await apiPost("/api/verify", { batchId: batch.batchId });
      await refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Verification failed";
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    }
  }

  return (
    <AnimatePresence>
      {batch && status && (
        <motion.div
          key={batch.batchId}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold text-zinc-100">
              Batch #{batch.batchId}
            </span>
            <button
              onClick={() => dispatch({ type: "INSPECT_BATCH", batchId: null })}
              aria-label="Close batch inspector"
              className="text-zinc-500 hover:text-zinc-300 text-lg leading-none"
            >
              ×
            </button>
          </div>

          <div
            className={`rounded-lg border p-2.5 space-y-1 ${status.border} ${status.bg}`}
          >
            <p className="text-xs font-semibold text-zinc-200">{status.label}</p>
            <p className="text-[11px] text-zinc-400 leading-relaxed">{status.explanation}</p>
          </div>

          <p className="text-[11px] text-zinc-500 leading-relaxed border-l-2 border-zinc-700 pl-2">
            {batchWindowNote(batch)}
          </p>

          {challengeWindowNote(batch) && (
            <p className="text-[10px] text-blue-300/90 leading-relaxed border-l-2 border-blue-800 pl-2">
              {challengeWindowNote(batch)}
            </p>
          )}

          {bondSettlementNote(batch) && (
            <p className="text-[10px] text-emerald-300/90 leading-relaxed border-l-2 border-emerald-800 pl-2">
              {bondSettlementNote(batch)}
            </p>
          )}

          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span className="text-zinc-500">Engine</span>
              {engineBadge(batch.engineType)}
            </div>
            <p className="text-[10px] text-zinc-600 leading-snug">
              {engineExplanation(batch.engineType)}
            </p>

            <div className="border-t border-zinc-800 pt-2 space-y-1.5">
              <div className="flex justify-between">
                <span className="text-zinc-500" title="L2 block range covered by this batch">L2 blocks</span>
                <span className="font-mono text-zinc-300">
                  {batch.l2StartBlock} → {batch.l2EndBlock}
                </span>
              </div>
              <p className="text-[10px] text-zinc-700 leading-snug">
                These L2 blocks' swaps are all covered by the single state root below. If any swap was wrong, the entire batch is invalid.
              </p>

              <div className="flex justify-between pt-1">
                <span className="text-zinc-500" title="Number of swap transactions in this batch">Swaps</span>
                <span className="font-mono text-zinc-300">{batch.txCount}</span>
              </div>

              <div className="flex justify-between">
                <span className="text-zinc-500" title="32-byte hash committing to all balances after this batch">State root</span>
                <span className="font-mono text-zinc-400 text-[10px]">
                  {hex(batch.postStateRoot)}
                </span>
              </div>
              <p className="text-[10px] text-zinc-700 leading-snug">
                The state root is a single 32-byte hash of all account balances after the batch ran. The sequencer posts this to L1, if it&apos;s wrong, a challenger can prove it on-chain.
              </p>
            </div>

            {batch.txCount > 0 && (
              <div className="border-t border-zinc-800 pt-2">
                <SwapDetailList swaps={batchSwaps(batch)} layout="cards" />
              </div>
            )}
          </div>

          {batch.flagged && batch.postedRoot && batch.expectedRoot && (
            <div className="border-t border-zinc-800 pt-3 space-y-2 text-xs">
              <p className="text-zinc-400 font-semibold">State root mismatch detected</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                The honest watcher replayed every swap in this batch using the verified engine and got a different answer than the sequencer posted.
              </p>
              <div>
                <span className="text-red-400">Sequencer posted</span>
                <p className="font-mono text-zinc-400 break-all text-[10px]">
                  {hex(batch.postedRoot)}
                </p>
              </div>
              <div>
                <span className="text-emerald-400">Honest watcher computed</span>
                <p className="font-mono text-zinc-400 break-all text-[10px]">
                  {hex(batch.expectedRoot)}
                </p>
              </div>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                A challenger must post a {PORTAL_BOND_ETH} ETH bond to open a dispute on L1. The bond is returned if the challenge succeeds and the sequencer loses theirs.
              </p>
            </div>
          )}

          {batch.verification && (
            <div className="border-t border-zinc-800 pt-3 space-y-2 text-xs">
              <p className="text-zinc-400 font-semibold">
                Local verification result:{" "}
                <span className={batch.verification.result === "verified_mismatch" ? "text-orange-300" : "text-emerald-300"}>
                  {batch.verification.result === "verified_mismatch" ? "mismatch found" : "claim appears valid"}
                </span>
              </p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                User/watcher spent {weiToEth(batch.verification.costWei)} ETH-equivalent in local compute and L1 gas budget to replay the batch before risking a challenge bond.
              </p>
              <p className="text-[10px] text-zinc-500 leading-relaxed">
                {batch.verification.reason}
              </p>
            </div>
          )}

          {batch.divergence && (
            <div className="border-t border-zinc-800 pt-3 space-y-1.5 text-xs">
              <p className="text-zinc-400 font-semibold">Fraud proof committed on L1</p>
              <p className="text-[10px] text-zinc-600 leading-relaxed">
                Bisection narrowed all swaps in the batch down to one instruction. That instruction&apos;s hash is now permanently recorded on L1 as proof of fraud.
              </p>
              {batch.divergence.rawHonestLen ? (
                <p className="text-[10px] text-zinc-600 leading-relaxed">
                  The transaction ran{" "}
                  <span className="font-mono text-zinc-400">
                    {batch.divergence.rawHonestLen.toLocaleString()}
                  </span>{" "}
                  EVM instructions; only{" "}
                  <span className="font-mono text-zinc-400">
                    {batch.divergence.honestSteps.length}
                  </span>{" "}
                  touch storage or make calls, and exactly one of those is wrong.
                </p>
              ) : null}
              <div className="flex justify-between">
                <span className="text-zinc-500" title="EVM opcode where honest and claimed traces diverge">Opcode</span>
                <span className="font-mono text-red-300">
                  {batch.divergence.op} · {opHeadline(batch.divergence.op)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500" title="Which contract variable this storage slot holds">Slot holds</span>
                <span className="font-mono text-zinc-400 text-right">
                  {slotMeaning(batch.divergence.slot, batch.engineType).label}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500" title="Step number in the filtered opcode trace">Trace step</span>
                <span className="font-mono text-zinc-300">
                  #{batch.divergence.divergenceIdx}
                </span>
              </div>
              {(batch.divergence.honestVal || batch.divergence.claimedVal) && (
                <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-1 pt-1 border-t border-zinc-800/80 mt-1.5">
                  <span className="text-emerald-400" title="Value the verified engine computed">Honest</span>
                  <span className="font-mono text-emerald-300 text-right break-all">
                    {decodeWord(batch.divergence.honestVal).display}
                  </span>
                  <span className="text-red-400" title="Value the sequencer wrote">Sequencer</span>
                  <span className="font-mono text-red-300 text-right break-all">
                    {decodeWord(batch.divergence.claimedVal).display}
                  </span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-2 pt-1 flex-col">
            {batch.txCount > 0 && !batch.verification && !batch.challenged && !batch.finalized && (
              <>
                <button
                  onClick={handleVerify}
                  disabled={batch.txCount === 0}
                  className="w-full btn-green text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Verify locally (0.02 ETH compute/gas)
                </button>
                <p className="text-[10px] text-zinc-500 text-center leading-relaxed">
                  Normal mode never auto-challenges. Verify first, then decide whether to risk the L1 challenge bond.
                </p>
              </>
            )}
            {batch.txCount === 0 && (
              <p className="text-[10px] text-zinc-600 text-center leading-relaxed">
                Empty batch: no transaction hashes, no fraud-proof trace, challenge disabled.
              </p>
            )}
            {batch.verification?.result === "verified_mismatch" && !batch.challenged && (
              <button onClick={handleChallenge} className="w-full btn-red text-xs">
                Challenge on L1 ({PORTAL_BOND_ETH} ETH bond)
              </button>
            )}
            {batch.verification?.result === "verified_valid" && !batch.challenged && (
              <>
                <button onClick={handleChallenge} className="w-full btn-red text-xs">
                  Challenge anyway ({PORTAL_BOND_ETH} ETH bond at risk)
                </button>
                <p className="text-[10px] text-amber-400/90 text-center leading-relaxed">
                  Verification found no mismatch. This demonstrates a failed challenge where the challenger bond is slashed.
                </p>
              </>
            )}
            {batch.resolved && batch.divergence && (
              <button
                onClick={() => onShowOpcodeRace(batch.batchId)}
                className="w-full btn-green text-xs"
              >
                Walk opcode proof step-by-step ↗
              </button>
            )}
            {batch.resolved && batch.divergence && (
              <p className="text-[10px] text-zinc-600 text-center">
                Also listed in Proof lab below when you want to revisit.
              </p>
            )}
            {batch.flagged && !batch.resolved && batch.challenged && (
              <p className="text-[10px] text-zinc-600 text-center">
                Dispute in progress — see Optimistic Tracker for swap rollback and bond ledger.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
