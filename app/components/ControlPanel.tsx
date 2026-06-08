"use client";

import { useState, useEffect } from "react";
import { useAppStore } from "../lib/store";
import { apiPost } from "../lib/ws";
import { parseUrlHash, writeUrlSeed } from "../lib/url";

export function ControlPanel() {
  const { state, dispatch, refreshState } = useAppStore();
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState(3);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const p = parseUrlHash();
    setSeed(p.seed);
    setSpeed(p.speed);
  }, []);

  async function call(path: string, body?: unknown) {
    setBusy(true);
    try {
      await apiPost(path, body);
      await refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Request failed";
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    } finally {
      setBusy(false);
    }
  }

  async function handleStart() {
    await call("/api/start", { seed, speed });
  }

  async function handleReseed() {
    writeUrlSeed(seed);
    await call("/api/reseed", { seed });
  }

  const active = state.running;
  const paused = state.paused;
  const connected = state.connected;

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-4">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"} inline-block`}
        />
        <span className="text-xs text-zinc-400 font-mono">
          {connected
            ? active
              ? paused
                ? "simulation paused"
                : "simulation running"
              : "connected, ready to start"
            : "connecting to backend…"}
        </span>
      </div>

      {/* Seed */}
      <div className="space-y-1.5">
        <div className="flex items-baseline gap-2">
          <label htmlFor="seed-input" className="text-xs text-zinc-400 font-semibold">
            Seed
          </label>
          <span className="text-[10px] text-zinc-600">
            deterministic replay, same seed = same fraud pattern
          </span>
        </div>
        <input
          id="seed-input"
          name="seed"
          type="number"
          value={Number.isFinite(seed) ? seed : 42}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSeed(Number.isFinite(v) ? v : 42);
          }}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          The seed feeds a keccak256-chain PRNG that controls which batches are honest vs fraudulent. Try the demo cards below for pre-tuned scenarios.
        </p>
      </div>

      {/* Speed */}
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="speed-input" className="text-xs text-zinc-400 font-semibold">
            Speed
          </label>
          <span className="text-xs font-mono text-zinc-300">
            {Number.isFinite(speed) ? speed : 3}×
          </span>
        </div>
        <input
          id="speed-input"
          name="speed"
          type="range"
          min={1}
          max={10}
          value={Number.isFinite(speed) ? speed : 3}
          onChange={(e) => {
            const v = Number(e.target.value);
            setSpeed(Number.isFinite(v) ? v : 3);
          }}
          className="w-full accent-emerald-400"
        />
        <p className="text-[10px] text-zinc-600 leading-relaxed">
          Scales Anvil block times. At 4× you see fraud resolved in ~30 s. At 1× it runs at realistic mainnet pace.
        </p>
      </div>

      {/* Action buttons */}
      <div className="grid grid-cols-2 gap-2">
        {!active ? (
          <button
            onClick={handleStart}
            disabled={busy || !connected}
            className="col-span-2 btn-green"
          >
            {busy ? "Starting…" : "Start simulation"}
          </button>
        ) : (
          <>
            <button
              onClick={() => call("/api/pause")}
              disabled={busy || paused}
              className="btn-zinc"
            >
              Pause
            </button>
            <button
              onClick={() => call("/api/resume")}
              disabled={busy || !paused}
              className="btn-zinc"
            >
              Resume
            </button>
            <button
              onClick={handleReseed}
              disabled={busy}
              className="btn-zinc"
            >
              {busy ? "Reseeding…" : "Reseed"}
            </button>
            <button
              onClick={() => call("/api/stop")}
              disabled={busy}
              className="btn-red"
            >
              Stop
            </button>
          </>
        )}
      </div>

      {!connected && (
        <p className="text-[10px] text-zinc-600 leading-relaxed border-t border-zinc-800 pt-3">
          Waiting for the Go backend. Run <span className="font-mono text-zinc-500">make dev</span> in the repo root to start both the backend and this frontend.
        </p>
      )}
    </div>
  );
}
