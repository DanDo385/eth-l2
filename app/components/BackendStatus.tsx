"use client";

import { useEffect, useState } from "react";
import { healthUrl, IS_REMOTE_BACKEND } from "../data/ports";

type Status = "checking" | "online" | "offline";

/**
 * Lightweight health chip. Fail-closed: never throws; offline is an explicit state.
 * Uses same-origin `/health/ready` on Vercel (rewritten to the Cloudflare Tunnel).
 */
export function BackendStatus({ className = "" }: { className?: string }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function probe() {
      try {
        const res = await fetch(healthUrl(), {
          method: "GET",
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
        });
        const body = (await res.text()).trim();
        const ready = res.ok && body === "READY";
        if (!cancelled) setStatus(ready ? "online" : "offline");
      } catch {
        if (!cancelled) setStatus("offline");
      }
    }

    void probe();
    const id = setInterval(() => void probe(), 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const label =
    status === "checking"
      ? "checking backend…"
      : status === "online"
        ? "backend online"
        : "backend offline";

  const dot =
    status === "online"
      ? "bg-emerald-400"
      : status === "checking"
        ? "bg-zinc-500"
        : "bg-amber-400";

  return (
    <div
      className={`inline-flex items-center gap-2 text-[11px] text-zinc-400 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span aria-hidden="true" className={`inline-block h-1.5 w-1.5 rounded-full ${dot}`} />
      <span>{label}</span>
      {status === "offline" && (
        <span className="text-amber-400/90">
          {IS_REMOTE_BACKEND
            ? "— lab UI still works; live sim needs the Ubuntu tunnel"
            : "— run make backend"}
        </span>
      )}
    </div>
  );
}
