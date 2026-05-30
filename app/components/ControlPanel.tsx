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
      <div className="flex items-center gap-2">
        <span
          className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"} inline-block`}
        />
        <span className="text-xs text-zinc-400 font-mono">
          {connected ? "connected" : "disconnected"}
        </span>
      </div>

      <div className="space-y-2">
        <label htmlFor="seed-input" className="text-xs text-zinc-500 uppercase tracking-wide">Seed</label>
        <input
          id="seed-input"
          name="seed"
          type="number"
          value={seed}
          onChange={(e) => setSeed(Number(e.target.value))}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-100 focus:outline-none focus:border-emerald-500"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="speed-input" className="text-xs text-zinc-500 uppercase tracking-wide">
          Speed: {speed}×
        </label>
        <input
          id="speed-input"
          name="speed"
          type="range"
          min={1}
          max={10}
          value={speed}
          onChange={(e) => setSpeed(Number(e.target.value))}
          className="w-full accent-emerald-400"
        />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {!active ? (
          <button
            onClick={handleStart}
            disabled={busy || !connected}
            className="col-span-2 btn-green"
          >
            Start
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
              Reseed
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
    </div>
  );
}
