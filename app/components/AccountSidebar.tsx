"use client";

import { useAppStore } from "../lib/store";
import { DEMO_ACCOUNTS } from "../data/accounts";
import { safeNum } from "../lib/numbers";
import { computeBondLedger } from "../lib/opLedger";
import type { LabMode } from "./LabFrame";

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function AccountSidebar({
  mode = "optimistic",
  showEventLog = true,
}: {
  mode?: LabMode;
  showEventLog?: boolean;
}) {
  const { state } = useAppStore();
  const batchList = Object.values(state.batches);
  const flagged = batchList.filter((b) => b.flagged).length;
  const resolved = batchList.filter((b) => b.resolved).length;
  const zkRollups = Object.values(state.zkRollups);
  const zkAccepted = zkRollups.filter((p) => p.accepted).length;
  const zkRejected = zkRollups.length - zkAccepted;
  const ledger = computeBondLedger(batchList);
  const locked =
    ledger.sequencer.posted +
    ledger.challenger.posted -
    ledger.sequencer.returned -
    ledger.challenger.returned -
    ledger.challenger.won;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Accounts</p>
      <ul className="space-y-2">
        {DEMO_ACCOUNTS.map(({ role, addr }) => (
          <li key={addr} className="flex flex-col">
            <span className="text-xs text-zinc-400">{role}</span>
            <span className="text-xs font-mono text-zinc-300">{short(addr)}</span>
          </li>
        ))}
      </ul>

      {mode === "optimistic" ? (
        <>
          <div className="border-t border-zinc-800 pt-3 space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Batches</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-zinc-400">Total</span>
              <span className="text-zinc-100 font-mono">{batchList.length}</span>
              <span className="text-yellow-400">Flagged</span>
              <span className="text-yellow-300 font-mono">{flagged}</span>
              <span className="text-red-400">Resolved</span>
              <span className="text-red-300 font-mono">{resolved}</span>
            </div>
          </div>

          <div className="border-t border-zinc-800 pt-3 space-y-1">
            <p className="text-xs text-zinc-500 uppercase tracking-wide">Economics</p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <span className="text-zinc-400">Escrow locked</span>
              <span className="text-zinc-100 font-mono">{Math.max(locked, 0).toFixed(2)} ETH</span>
              <span className="text-zinc-400">Proposer posted</span>
              <span className="text-zinc-100 font-mono">{ledger.sequencer.posted.toFixed(2)} ETH</span>
              <span className="text-red-400">Proposer slashed</span>
              <span className="text-red-300 font-mono">{ledger.sequencer.slashed.toFixed(2)} ETH</span>
              <span className="text-emerald-400">Challenger rewards</span>
              <span className="text-emerald-300 font-mono">{ledger.challenger.won.toFixed(2)} ETH</span>
            </div>
          </div>
        </>
      ) : (
        <div className="border-t border-zinc-800 pt-3 space-y-1">
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Validity proofs</p>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <span className="text-zinc-400">Submitted</span>
            <span className="text-zinc-100 font-mono">{zkRollups.length}</span>
            <span className="text-emerald-400">Accepted</span>
            <span className="text-emerald-300 font-mono">{zkAccepted}</span>
            <span className="text-red-400">Rejected</span>
            <span className="text-red-300 font-mono">{zkRejected}</span>
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed">
            ZK settlement is gated by verifier output, so failed claims stop before L1 accepts the state root.
          </p>
        </div>
      )}

      <div className="border-t border-zinc-800 pt-3 space-y-1">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Latest blocks</p>
        <div className="space-y-1 text-xs font-mono">
          {Object.entries(state.blocks).map(([chain, num]) => (
            <div key={chain} className="flex justify-between">
              <span className="text-zinc-500">{chain}</span>
              <span className="text-zinc-300">{safeNum(num)}</span>
            </div>
          ))}
        </div>
      </div>

      {showEventLog && (
      <div className="border-t border-zinc-800 pt-3 space-y-2">
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Event log</p>
        <div className="max-h-56 overflow-y-auto space-y-1.5 pr-1">
          {state.eventLog.length === 0 ? (
            <p className="text-[10px] text-zinc-600">No events yet.</p>
          ) : (
            state.eventLog.slice(-30).reverse().map((entry, index) => (
              <div key={`${entry.seq}-${index}-${entry.event}`} className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5">
                <div className="flex justify-between gap-2 text-[9px] font-mono">
                  <span className="text-zinc-500">#{entry.seq}</span>
                  <span className={entry.layer === "L1" ? "text-violet-400" : entry.layer === "L2" ? "text-blue-400" : "text-amber-400"}>
                    {entry.layer}
                  </span>
                </div>
                <p className="text-[10px] text-zinc-300 leading-snug">{entry.summary}</p>
              </div>
            ))
          )}
        </div>
      </div>
      )}
    </div>
  );
}
