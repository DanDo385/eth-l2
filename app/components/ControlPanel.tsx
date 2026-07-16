"use client";

import { useSessionControlsContext } from "../lib/sessionControls";
import { BACKEND_PORT, IS_REMOTE_BACKEND } from "../data/ports";
import { OP_SUSPICIOUS_60S, OP_SUSPICIOUS_120S } from "../data/demoGallery";
import { FieldLabel } from "./InfoTip";

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
    <div className="space-y-3 rounded-xl border border-zinc-800 bg-zinc-900 p-3 sm:p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span
            className={`inline-block h-2 w-2 shrink-0 rounded-full ${
              connected ? "bg-emerald-400" : "bg-red-500"
            }`}
          />
          <span className="truncate text-xs font-mono text-zinc-400">
            {connected
              ? active
                ? paused
                  ? "paused"
                  : "running"
                : "ready"
              : awaitingBackend
                ? "connecting…"
                : "backend down"}
          </span>
        </div>
        {active && (
          <span
            className={`shrink-0 font-mono text-xs ${
              expired ? "text-amber-300" : "text-zinc-300"
            }`}
          >
            {remainingSeconds}s
          </span>
        )}
      </div>

      {!connected && !awaitingBackend && (
        <p className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-2.5 py-2 text-xs leading-relaxed text-amber-400/90">
          {IS_REMOTE_BACKEND ? (
            <>
              Backend offline - the explainer UI still works. Live simulation needs
              the Ubuntu Go API reachable via the Cloudflare Tunnel (
              <span className="font-mono text-amber-200">
                api-staging-eth-l2.magro.dev
              </span>
              ).
            </>
          ) : (
            <>
              Go API on{" "}
              <span className="font-mono text-amber-200">
                localhost:{BACKEND_PORT}
              </span>{" "}
              is not responding. Run{" "}
              <span className="font-mono text-amber-200">make backend</span> or{" "}
              <span className="font-mono text-amber-200">make dev</span>.
            </>
          )}
        </p>
      )}

      {/* Primary actions first when idle */}
      {!active ? (
        <button
          onClick={handleStart}
          disabled={busy || !connected}
          className="btn-green w-full"
        >
          {busy ? "Starting…" : "Start simulation"}
        </button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void call("/api/pause")}
            disabled={busy || paused}
            aria-pressed={paused}
            className={paused ? "btn-zinc opacity-60" : "btn-zinc"}
          >
            {paused ? "Paused" : "Pause"}
          </button>
          <button
            type="button"
            onClick={() => void call("/api/resume")}
            disabled={busy || !paused}
            className={!paused ? "btn-zinc opacity-60" : "btn-green"}
          >
            Resume
          </button>
          <button
            type="button"
            onClick={handleReseed}
            disabled={busy}
            className="btn-zinc"
          >
            {busy ? "Reseeding…" : "Reseed"}
          </button>
          <button
            type="button"
            onClick={() => void call("/api/stop")}
            disabled={busy}
            className="btn-red"
          >
            Stop
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 border-t border-zinc-800 pt-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="seed-input"
            tipLabel="About seeds"
            tip={
              <>
                Same seed ⇒ same fraud pattern. The value feeds a keccak256-chain
                PRNG that decides which batches are honest vs fraudulent. Prefer
                a demo card above for a pre-tuned scenario.
              </>
            }
          >
            Seed
          </FieldLabel>
          <input
            id="seed-input"
            name="seed"
            type="number"
            value={Number.isFinite(seed) ? seed : 42}
            onChange={(e) => {
              const v = Number(e.target.value);
              setSeed(Number.isFinite(v) ? v : 42);
            }}
            className="w-full max-w-[10rem] rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
          />
        </div>

        <div className="space-y-1.5">
          <FieldLabel
            htmlFor="speed-input"
            tipLabel="About simulation speed"
            tip={
              <>
                Scales Anvil block times. At 4×, a 60s run usually surfaces{" "}
                {OP_SUSPICIOUS_60S} suspicious OP batches for you to verify and
                challenge.
              </>
            }
            trailing={
              <span className="font-mono text-xs text-zinc-300">
                {Number.isFinite(speed) ? speed : 3}×
              </span>
            }
          >
            Speed
          </FieldLabel>
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
        </div>
      </div>

      <div className="space-y-2 border-t border-zinc-800 pt-3">
        <FieldLabel
          tipLabel="About the session timer"
          tip={
            <>
              On expiry the simulation stops and tears down Anvil (same as
              Stop). 60s usually surfaces {OP_SUSPICIOUS_60S} suspicious OP
              batches; 120s usually surfaces {OP_SUSPICIOUS_120S}. The app never
              auto-challenges - you decide.
            </>
          }
          trailing={
            !active ? (
              <span className="font-mono text-xs text-zinc-500">
                {remainingSeconds}s ready
              </span>
            ) : null
          }
        >
          Session
        </FieldLabel>
        <div className="grid grid-cols-2 gap-2">
          {[60, 120].map((seconds) => (
            <button
              key={seconds}
              type="button"
              onClick={() => {
                setSessionSeconds(seconds as 60 | 120);
                if (!active) setRemainingSeconds(seconds);
              }}
              className={
                sessionSeconds === seconds ? "btn-green text-xs" : "btn-zinc text-xs"
              }
            >
              {seconds}s
            </button>
          ))}
        </div>
        {expired && (
          <p className="text-xs text-amber-300/90">
            Session expired - simulation stopped. Start or pick a demo to run again.
          </p>
        )}
      </div>
    </div>
  );
}
