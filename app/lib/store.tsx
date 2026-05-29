"use client";

import {
  createContext,
  useContext,
  useReducer,
  useEffect,
  type ReactNode,
} from "react";
import { appReducer, initialState } from "./reducer";
import { apiGet, openWs } from "./ws";
import type { ApiStateSnapshot, AppAction, AppState } from "../types";

interface StoreContext {
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
}

const Ctx = createContext<StoreContext | null>(null);

export function AppStoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(appReducer, initialState);

  useEffect(() => {
    const cleanup = openWs(
      (event) => dispatch({ type: "WS_EVENT", event }),
      (connected) =>
        dispatch({ type: connected ? "WS_CONNECTED" : "WS_DISCONNECTED" }),
    );
    return cleanup;
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

  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useAppStore(): StoreContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAppStore must be used within AppStoreProvider");
  return ctx;
}
