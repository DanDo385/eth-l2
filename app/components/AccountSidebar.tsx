"use client";

import { useAppStore } from "../lib/store";

// Anvil default account addresses (from test mnemonic)
const ACCOUNTS = [
  { role: "Deployer", addr: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" },
  { role: "Sequencer", addr: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" },
  { role: "Challenger", addr: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" },
  { role: "Trader 0", addr: "0x90F79bf6EB2c4f870365E785982E1f101E93b906" },
  { role: "Trader 1", addr: "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" },
];

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
        {ACCOUNTS.map(({ role, addr }) => (
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
              <span className="text-zinc-300">{num}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
