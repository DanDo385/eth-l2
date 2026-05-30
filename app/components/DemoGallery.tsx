"use client";

import { motion } from "framer-motion";
import { apiPost } from "../lib/ws";
import { useAppStore } from "../lib/store";
import { writeUrlSeed } from "../lib/url";

const DEMOS = [
  {
    seed: 42,
    title: "Subtle fraud",
    caption: "Fee rounding attack — tiny SSTORE difference at step #255",
    color: "border-red-700 hover:border-red-500",
    badge: "bg-red-900/40 text-red-300",
  },
  {
    seed: 88,
    title: "Honest run",
    caption: "All batches valid — no challenges issued",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
  },
  {
    seed: 17,
    title: "Obvious fraud",
    caption: "Wrong output amount — diverges at first SSTORE",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
  },
  {
    seed: 99,
    title: "Mixed",
    caption: "Both fraud types appear — bisection resolves each",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
  },
];

export function DemoGallery() {
  const { dispatch, refreshState } = useAppStore();

  async function launch(seed: number) {
    writeUrlSeed(seed);
    try {
      await apiPost("/api/stop");
      await apiPost("/api/start", { seed, speed: 4 });
      await refreshState();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Demo launch failed";
      dispatch({
        type: "WS_EVENT",
        event: {
          type: "error_occurred",
          payload: { chain: "api", message },
        },
      });
    }
  }

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
      <p className="text-xs text-zinc-500 uppercase tracking-wide">Demo gallery</p>
      <div className="grid grid-cols-2 gap-2">
        {DEMOS.map((demo) => (
          <motion.button
            key={demo.seed}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => launch(demo.seed)}
            className={`text-left p-3 rounded-lg border bg-zinc-950 transition-colors min-w-0 ${demo.color}`}
          >
            <div className="flex items-start gap-2 mb-1 min-w-0">
              <span
                className={`shrink-0 text-xs px-1.5 py-0.5 rounded font-mono ${demo.badge}`}
              >
                #{demo.seed}
              </span>
              <span className="text-xs font-semibold text-zinc-200 leading-snug">
                {demo.title}
              </span>
            </div>
            <p className="text-[10px] text-zinc-500 leading-snug break-words">{demo.caption}</p>
          </motion.button>
        ))}
      </div>
    </div>
  );
}
