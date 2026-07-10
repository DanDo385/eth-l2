"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { appReducer, initialState } from "./reducer";
import { apiGet, openWs } from "./ws";
import { API_BASE } from "../data/ports";
import type { ApiStateSnapshot, AppAction, AppState } from "../types";

interface StoreContext {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
  refreshState: () => Promise<void>;
}

const Ctx = createContext<StoreContext | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  const refreshState = useCallback(async () => {
    try {
      const res = await apiGet("/api/state");
      if (!res.ok) return;
      const snapshot = (await res.json()) as ApiStateSnapshot;
      dispatch({ type: "HYDRATE_STATE", snapshot });
    } catch {
      // Ignore refresh errors; websocket events still drive live state.
    }
  }, []);

  useEffect(() => {
    const cleanup = openWs(
      (event) => dispatch({ type: "WS_EVENT", event }),
      (connected) =>
        dispatch({ type: connected ? "WS_CONNECTED" : "WS_DISCONNECTED" }),
    );

    // Best-effort stop when the tab is closed/hidden for bfcache. The authoritative
    // teardown is server-side idle-stop after the last WebSocket disconnects.
    const stopOnLeave = () => {
      try {
        const url = `${API_BASE}/api/stop`;
        if (typeof navigator !== "undefined" && typeof navigator.sendBeacon === "function") {
          navigator.sendBeacon(url, new Blob(["{}"], { type: "application/json" }));
          return;
        }
        void fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
          keepalive: true,
        });
      } catch {
        // ignore — idle-stop watchdog still applies
      }
    };
    window.addEventListener("pagehide", stopOnLeave);

    return () => {
      window.removeEventListener("pagehide", stopOnLeave);
      cleanup();
    };
  }, []);

  useEffect(() => {
    if (!state.connected) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet("/api/state");
        if (!res.ok) return;
        const snapshot = (await res.json()) as ApiStateSnapshot;
        if (!cancelled) dispatch({ type: "HYDRATE_STATE", snapshot });
      } catch {
        // Ignore hydration errors; websocket events still drive live state.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.connected]);

  useEffect(() => {
    if (!state.running) return;
    void refreshState();
  }, [state.running, refreshState]);

  return (
    <Ctx.Provider value={{ state, dispatch, refreshState }}>{children}</Ctx.Provider>
  );
}

export function useAppStore(): StoreContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
