"use client";

import { motion } from "framer-motion";
import { apiPost } from "../lib/ws";
import { useAppStore } from "../lib/store";
import { writeUrlSeed } from "../lib/url";

const DEMOS = [
  {
    seed: 88,
    title: "Clean run",
    caption: "All batches honest, watch the watcher confirm each state root with zero disputes.",
    detail: "Best first demo. See the normal rollup lifecycle: post → verify → finalize, no challenges.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
    icon: "✓",
  },
  {
    seed: 42,
    title: "Subtle fraud",
    caption: "Rare fee-rounding attack, an SSTORE writes a slightly different balance.",
    detail: "Hard to spot without replaying. The divergence appears deep in the trace at an SSTORE opcode.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
    icon: "≈",
  },
  {
    seed: 17,
    title: "Obvious fraud",
    caption: "Blatant output doubling, sequencer claims 2× the correct swap amount.",
    detail: "Diverges at the first SSTORE. Easy to catch; used to show what the fraud proof pipeline looks like end-to-end.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
    icon: "✗",
  },
  {
    seed: 99,
    title: "Mixed",
    caption: "Both fraud types appear over time, ~1-in-10 batches, realistic frequency.",
    detail: "Shows why the 7-day challenge window exists: fraud is rare, but economic bonds make it unprofitable.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
    icon: "~",
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
      <div>
        <p className="text-xs text-zinc-500 uppercase tracking-wide">Demo gallery</p>
        <p className="text-[10px] text-zinc-600 mt-0.5 leading-relaxed">
          Click any card to start. Seed 88 is the best entry point.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {DEMOS.map((demo) => (
          <motion.button
            key={demo.seed}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => launch(demo.seed)}
            className={`text-left p-3 rounded-lg border bg-zinc-950 transition-colors min-w-0 ${demo.color}`}
            title={demo.detail}
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
      <p className="text-[10px] text-zinc-700 leading-relaxed border-t border-zinc-800 pt-2">
        Fraud is ~1-in-10 batches by design. Economic bonds make cheating unprofitable even when technically possible.
      </p>
    </div>
  );
}
