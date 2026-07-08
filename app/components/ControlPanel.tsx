"use client";

import { useSessionControlsContext } from "../lib/sessionControls";
import { BACKEND_PORT } from "../data/ports";
import { OP_SUSPICIOUS_60S, OP_SUSPICIOUS_120S } from "../data/demoGallery";

export function ControlPanel() {
  const {
    seed,
    setSeed,
    speed,
    setSpeed,
    sessionSeconds,
    setSessionSeconds,
    remainingSeconds,
    setRemainingSeconds,
    expired,
    busy,
    awaitingBackend,
    connected,
    active,
    paused,
    call,
    handleStart,
    handleReseed,
  } = useSessionControlsContext();

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
            : awaitingBackend
              ? "connecting to backend…"
              : "backend unreachable — run make dev"}
        </span>
      </div>

      {!connected && !awaitingBackend && (
        <p className="text-[10px] text-amber-400/90 leading-relaxed border border-amber-900/50 bg-amber-950/20 rounded-lg px-2.5 py-2">
          The Go API on <span className="font-mono text-amber-200">localhost:{BACKEND_PORT}</span> is not
          responding. Start it with <span className="font-mono text-amber-200">make dev</span> or{" "}
          <span className="font-mono text-amber-200">make backend</span> in another terminal.
        </p>
      )}

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
          Scales Anvil block times. At 4×, a 60s run usually surfaces {OP_SUSPICIOUS_60S} suspicious OP batches for you to verify and challenge.
        </p>
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <p className="text-xs text-zinc-400 font-semibold">Session timer</p>
        <div className="grid grid-cols-2 gap-2">
          {[60, 120].map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => {
                setSessionSeconds(seconds as 60 | 120);
                if (!active) setRemainingSeconds(seconds);
              }}
              className={sessionSeconds === seconds ? "btn-green text-xs" : "btn-zinc text-xs"}
            >
              {seconds}s
            </button>
          ))}
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-950/50 px-3 py-2">
          <div className="flex justify-between text-xs font-mono">
            <span className={expired ? "text-amber-300" : "text-zinc-400"}>
              {expired ? "session expired" : active && !paused ? "countdown" : "timer ready"}
            </span>
            <span className="text-zinc-100">{remainingSeconds}s</span>
          </div>
          <p className="text-[10px] text-zinc-600 leading-relaxed mt-1">
            On expiry the simulation pauses and preserves blocks, batches, balances, and logs. 60s usually surfaces {OP_SUSPICIOUS_60S} suspicious OP batches; 120s usually surfaces {OP_SUSPICIOUS_120S}. The app never auto-challenges — you decide.
          </p>
        </div>
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
