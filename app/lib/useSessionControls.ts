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
      try {
        await apiPost(path, body);
        await refreshState();
      } catch (err) {
        const message = err instanceof Error ? err.message : "Request failed";
        reportError(message);
        throw err;
      } finally {
        setBusy(false);
      }
    },
    [refreshState, reportError],
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
      setRemainingSeconds((left) => {
        if (left <= 1) {
          clearInterval(timer);
          setExpired(true);
          void call("/api/pause");
          return 0;
        }
        return left - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [active, paused, expired, call]);

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
