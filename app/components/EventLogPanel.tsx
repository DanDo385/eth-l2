"use client";

import { useAppStore } from "../lib/store";

export function EventLogPanel() {
  const { state } = useAppStore();
  const entries = state.eventLog.slice(-36).reverse();

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-zinc-500 uppercase tracking-wide">Event log</p>
          <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
            Raw session events from the backend: L2 blocks, L1 batch posts, watcher flags,
            disputes, and bond settlement.
          </p>
        </div>
        <span className="text-[10px] font-mono text-zinc-600">{entries.length} shown</span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {entries.length === 0 ? (
          <p className="text-[10px] text-zinc-600">No events yet.</p>
        ) : (
          entries.map((entry, index) => (
            <div
              key={`${entry.seq}-${index}-${entry.event}`}
              className="rounded border border-zinc-800 bg-zinc-950/50 px-2 py-1.5"
            >
              <div className="flex justify-between gap-2 text-[9px] font-mono">
                <span className="text-zinc-500">#{entry.seq}</span>
                <span
                  className={
                    entry.layer === "L1"
                      ? "text-violet-400"
                      : entry.layer === "L2"
                        ? "text-blue-400"
                        : "text-amber-400"
                  }
                >
                  {entry.layer}
                </span>
              </div>
              <p className="text-[10px] text-zinc-300 leading-snug">{entry.summary}</p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
