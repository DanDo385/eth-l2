"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AnimatePresence, motion } from "framer-motion";

type InfoTipProps = {
  label: string;
  children: ReactNode;
  /** Compact label shown on the trigger; defaults to "i". */
  trigger?: string;
  className?: string;
  /** Prefer inline expansion under the control (default) vs a floating panel. */
  placement?: "inline" | "panel";
};

/**
 * Hover (desktop) / click (touch + keyboard) explainer.
 * Keeps dense protocol copy off the default surface until the user asks.
 */
export function InfoTip({
  label,
  children,
  trigger = "i",
  className = "",
  placement = "inline",
}: InfoTipProps) {
  const id = useId();
  const rootRef = useRef<HTMLSpanElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [hoverCapable, setHoverCapable] = useState(false);

  useEffect(() => {
    setHoverCapable(window.matchMedia("(hover: hover) and (pointer: fine)").matches);
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const close = useCallback(() => {
    clearCloseTimer();
    setOpen(false);
  }, [clearCloseTimer]);

  const openNow = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  }, [clearCloseTimer]);

  useEffect(() => () => clearCloseTimer(), [clearCloseTimer]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointer(e: MouseEvent | TouchEvent) {
      const el = rootRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) close();
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("touchstart", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("touchstart", onPointer);
    };
  }, [open, close]);

  return (
    <span
      ref={rootRef}
      className={`relative inline-flex flex-col ${className}`}
      onMouseEnter={() => {
        if (hoverCapable) openNow();
      }}
      onMouseLeave={() => {
        if (hoverCapable) scheduleClose();
      }}
    >
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        onFocus={openNow}
        onBlur={(e) => {
          const next = e.relatedTarget;
          if (next instanceof Node && rootRef.current?.contains(next)) return;
          close();
        }}
        className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold leading-none transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500/60 ${
          open
            ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
            : "border-zinc-600 bg-zinc-800/80 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
        }`}
      >
        {trigger}
      </button>

      <AnimatePresence>
        {open && (
          <motion.span
            id={id}
            role="region"
            aria-label={label}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.18 }}
            className={
              placement === "panel"
                ? "absolute left-0 top-full z-30 mt-1.5 w-[min(18rem,calc(100vw-2rem))] overflow-hidden"
                : "mt-1.5 block w-full max-w-prose overflow-hidden"
            }
          >
            <span className="block rounded-lg border border-zinc-700 bg-zinc-950 px-2.5 py-2 text-xs leading-relaxed text-zinc-400 shadow-lg shadow-black/40">
              {children}
            </span>
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

/** Label row with an optional InfoTip tucked beside the title. */
export function FieldLabel({
  htmlFor,
  children,
  tip,
  tipLabel,
  trailing,
}: {
  htmlFor?: string;
  children: ReactNode;
  tip?: ReactNode;
  tipLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-1.5">
        <label htmlFor={htmlFor} className="text-xs font-semibold text-zinc-400">
          {children}
        </label>
        {tip && tipLabel ? (
          <InfoTip label={tipLabel} placement="panel">
            {tip}
          </InfoTip>
        ) : null}
      </div>
      {trailing}
    </div>
  );
}
