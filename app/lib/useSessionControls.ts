"use client";

import { useState, useEffect, useCallback } from "react";
import { useAppStore } from "./store";
import { apiPost } from "./ws";
import { parseUrlHash, writeUrlSeed } from "./url";

export interface StartOptions {
  /** Stop any active session before starting (demo gallery cards). */
  fresh?: boolean;
}

export function useSessionControls() {
  const { state, dispatch, refreshState } = useAppStore();
  const [seed, setSeed] = useState(42);
  const [speed, setSpeed] = useState(3);
  const [sessionSeconds, setSessionSeconds] = useState<60 | 120>(60);
  const [remainingSeconds, setRemainingSeconds] = useState(60);
  const [expired, setExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [awaitingBackend, setAwaitingBackend] = useState(true);
  /** Seed of the last successful start — highlights the matching demo card. */
  const [activeSeed, setActiveSeed] = useState<number | null>(null);

  const connected = state.connected;
  const active = state.running;
  const paused = state.paused;

  useEffect(() => {
    if (connected) {
      setAwaitingBackend(false);
      return;
    }
    const timer = setTimeout(() => setAwaitingBackend(false), 4000);
    return () => clearTimeout(timer);
  }, [connected]);

  useEffect(() => {
    const p = parseUrlHash();
    setSeed(p.seed);
    setSpeed(p.speed);
  }, []);

  useEffect(() => {
    if (!active) {
      setActiveSeed(null);
    }
  }, [active]);

  const reportError = useCallback(
    (message: string) => {
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    },
    [dispatch],
  );

  const call = useCallback(
    async (path: string, body?: unknown) => {
      setBusy(true);
      // Optimistic UI: pause/resume should flip immediately, then reconcile via
      // websocket /api/state. Gallery badges and control labels key off `paused`.
      if (path === "/api/pause") {
        dispatch({ type: "SET_PAUSED", paused: true });
      } else if (path === "/api/resume") {
        dispatch({ type: "SET_PAUSED", paused: false });
        setExpired(false);
      } else if (path === "/api/stop") {
        setActiveSeed(null);
        setExpired(false);
      }
      try {
        await apiPost(path, body);
        await refreshState();
      } catch (err) {
        // Roll back optimistic pause if the request failed.
        if (path === "/api/pause") {
          dispatch({ type: "SET_PAUSED", paused: false });
        } else if (path === "/api/resume") {
          dispatch({ type: "SET_PAUSED", paused: true });
        }
        const message = err instanceof Error ? err.message : "Request failed";
        reportError(message);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [dispatch, refreshState, reportError],
  );

  const startSession = useCallback(
    async (nextSeed: number, nextSpeed: number, options?: StartOptions) => {
      writeUrlSeed(nextSeed);
      setSeed(nextSeed);
      setSpeed(nextSpeed);
      setRemainingSeconds(sessionSeconds);
      setExpired(false);
      setBusy(true);
      try {
        if (options?.fresh) {
          await apiPost("/api/stop");
        }
        await apiPost("/api/start", { seed: nextSeed, speed: nextSpeed });
        await refreshState();
        setActiveSeed(nextSeed);
      } catch (err) {
        const message = err instanceof Error ? err.message : "Start failed";
        reportError(message);
      } finally {
        setBusy(false);
      }
    },
    [sessionSeconds, refreshState, reportError],
  );

  const launchDemo = useCallback(
    (demoSeed: number) => startSession(demoSeed, speed, { fresh: true }),
    [startSession, speed],
  );

  const handleStart = useCallback(
    () => startSession(seed, speed),
    [startSession, seed, speed],
  );

  const handleReseed = useCallback(async () => {
    writeUrlSeed(seed);
    await call("/api/reseed", { seed });
    setActiveSeed(seed);
  }, [call, seed]);

  useEffect(() => {
    if (!active || paused || expired) return;
    const timer = setInterval(() => {
      setRemainingSeconds((left) => (left <= 1 ? 0 : left - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [active, paused, expired]);

  // Stop when the session timer hits zero — tears down Anvil so a forgotten
  // tab does not keep the MacBook mining. Must not dispatch from inside a
  // setState updater (that updates AppStoreProvider during this provider's render).
  useEffect(() => {
    if (!active || paused || expired || remainingSeconds > 0) return;
    setExpired(true);
    void call("/api/stop");
  }, [remainingSeconds, active, paused, expired, call]);

  return {
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
    activeSeed,
    call,
    startSession,
    launchDemo,
    handleStart,
    handleReseed,
  };
}
