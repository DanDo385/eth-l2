import type { LabMode } from "../components/LabFrame";

export interface DemoCard {
  seed: number;
  title: string;
  caption: string;
  detail: string;
  color: string;
  badge: string;
  icon?: string;
  /** Highlight as the suggested first demo. */
  recommended?: boolean;
}

/** At ~1/8 OP fault rate and 4× speed, expect roughly this many suspicious batches. */
export const OP_SUSPICIOUS_60S = "1–3";
export const OP_SUSPICIOUS_120S = "3–6";

export const OP_DEMOS: DemoCard[] = [
  {
    seed: 88,
    title: "Mostly honest",
    caption: "Low dispute density in a short run — good first look at post → verify → finalize.",
    detail: "Best entry point. Fault injection is ~1 in 8 batches, so a 60s window may still stay quiet.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
    icon: "✓",
    recommended: true,
  },
  {
    seed: 42,
    title: "Subtle fraud",
    caption: "Fee-rounding lie — divergence hides in an SSTORE deep in the trace.",
    detail: "Hard to spot without local replay. Useful for showing why verification matters before challenging.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
    icon: "≈",
  },
  {
    seed: 17,
    title: "Obvious fraud",
    caption: "Blatant output doubling — watcher flags quickly, good for a full challenge arc.",
    detail: "Diverges at the first SSTORE. Fastest path through verify → challenge → opcode proof.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
    icon: "✗",
  },
  {
    seed: 99,
    title: "Mixed",
    caption: `Both fraud types over time — usually ${OP_SUSPICIOUS_60S} suspicious batches in 60s at 4×.`,
    detail: "Shows why challenge windows exist: fraud is stochastic, but bonds make cheating unprofitable.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
    icon: "~",
  },
];

export const ZK_DEMOS: DemoCard[] = [
  {
    seed: 88,
    title: "Mostly valid",
    caption: "Accepted proofs dominate — watch the Claim → Prove → Verify pipeline stay green.",
    detail: "Best first ZK demo. Invalid claims are ~1 in 16 batches; short runs may show none.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
    recommended: true,
  },
  {
    seed: 42,
    title: "Rejected claim",
    caption: "A bad post root reaches L1 but fails the verifier before canonical settlement.",
    detail: "Open a batch card to inspect public inputs and why the recomputed root did not match.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
  },
  {
    seed: 17,
    title: "Fast rejection",
    caption: "Invalid claim caught at the validity gate — no fraud-proof game follows.",
    detail: "Contrast with optimistic rollups: rejection happens at submit time, not after a window.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
  },
  {
    seed: 99,
    title: "Mixed proofs",
    caption: "Accepted and rejected batches over a longer run — compare verifier gas and outcomes.",
    detail: "Useful for comparing simulated prove time vs measured verify gas across several batches.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
  },
];

export function demosForMode(mode: LabMode): DemoCard[] {
  return mode === "zk" ? ZK_DEMOS : OP_DEMOS;
}
