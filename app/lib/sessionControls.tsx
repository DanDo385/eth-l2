"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useSessionControls } from "./useSessionControls";

type SessionControls = ReturnType<typeof useSessionControls>;

const SessionControlsContext = createContext<SessionControls | null>(null);

export function SessionControlsProvider({ children }: { children: ReactNode }) {
  const controls = useSessionControls();
  return (
    <SessionControlsContext.Provider value={controls}>
      {children}
    </SessionControlsContext.Provider>
  );
}

export function useSessionControlsContext(): SessionControls {
  const ctx = useContext(SessionControlsContext);
  if (!ctx) {
    throw new Error("useSessionControlsContext must be used within SessionControlsProvider");
  }
  return ctx;
}
