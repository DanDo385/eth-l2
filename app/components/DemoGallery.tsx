"use client";

import { motion } from "framer-motion";
import { apiPost } from "../lib/ws";
import { useAppStore } from "../lib/store";
import { writeUrlSeed } from "../lib/url";
import type { LabMode } from "./LabFrame";

const OP_DEMOS = [
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
    caption: "Both fraud types appear over time, surfacing 1-2 suspicious batches per minute.",
    detail: "Shows why the 7-day challenge window exists: fraud is rare, but economic bonds make it unprofitable.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
    icon: "~",
  },
];

const ZK_DEMOS = [
  {
    seed: 88,
    title: "Clean validity",
    caption: "Every proof verifies, so L1 accepts each state update at the validity gate.",
    detail: "Best first ZK demo. Watch the prover, public inputs, verifier output, and bridge status stay green.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
  },
  {
    seed: 42,
    title: "Rejected proof",
    caption: "A bad state transition reaches L1 but fails verifier checks before settlement.",
    detail: "Use Proof lab to inspect why invalid ZK claims are rejected directly instead of entering a fraud game.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
  },
  {
    seed: 17,
    title: "Fast failure",
    caption: "An invalid proof is caught at verification, blocking bridge finality for that update.",
    detail: "Shows the difference between validity settlement and optimistic challenge windows.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
  },
  {
    seed: 99,
    title: "Mixed proofs",
    caption: "Accepted and rejected proof submissions appear over a longer run.",
    detail: "Good for comparing proof cost, verification gas, and finality state across several batches.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
  },
];

export function DemoGallery({ mode = "optimistic" }: { mode?: LabMode }) {
  const { dispatch, refreshState } = useAppStore();
  const isZk = mode === "zk";
  const demos = isZk ? ZK_DEMOS : OP_DEMOS;

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
        {demos.map((demo) => (
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
        {isZk
          ? "Invalid proof claims are rare by design here. L1 rejects them at the verifier before accepting the new state root."
          : "Fraud is tuned for the demo window: usually 1-2 suspicious batches to verify and challenge in 60s, 3-4 in 120s. Economic bonds make cheating unprofitable even when technically possible."}
      </p>
    </div>
  );
}
