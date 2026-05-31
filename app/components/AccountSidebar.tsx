"use client";

import { useAppStore } from "../lib/store";
import { DEMO_ACCOUNTS } from "../data/accounts";
import { safeNum } from "../lib/numbers";

function short(addr: string) {
  return addr.slice(0, 6) + "…" + addr.slice(-4);
}

export function AccountSidebar() {
  const { state } = useAppStore();
  const batchList = Object.values(state.batches);
  const flagged = batchList.filter((b) => b.flagged).length;
  const resolved = batchList.filter((b) => b.resolved).length;

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
    </div>
  );
}
