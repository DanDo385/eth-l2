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
    caption: "Quiet first run — post, verify, finalize.",
    detail:
      "Best entry point. Low dispute density in a short run. Fault injection is ~1 in 8 batches, so a 60s window may still stay quiet. Good first look at post → verify → finalize.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
    icon: "✓",
    recommended: true,
  },
  {
    seed: 42,
    title: "Subtle fraud",
    caption: "Fee-rounding lie buried in an SSTORE.",
    detail:
      "Hard to spot without local replay. Divergence hides deep in the trace — useful for showing why verification matters before challenging.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
    icon: "≈",
  },
  {
    seed: 17,
    title: "Obvious fraud",
    caption: "Output doubled — full challenge arc.",
    detail:
      "Blatant output doubling. Watcher flags quickly; diverges at the first SSTORE. Fastest path through verify → challenge → opcode proof.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
    icon: "✗",
  },
  {
    seed: 99,
    title: "Mixed",
    caption: `Both fraud types — usually ${OP_SUSPICIOUS_60S} in 60s.`,
    detail:
      "Both fraud types over time. Shows why challenge windows exist: fraud is stochastic, but bonds make cheating unprofitable.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
    icon: "~",
  },
];

export const ZK_DEMOS: DemoCard[] = [
  {
    seed: 88,
    title: "Mostly valid",
    caption: "Accepted proofs — Claim → Prove → Verify.",
    detail:
      "Best first ZK demo. Invalid claims are ~1 in 16 batches; short runs may show none. Watch the pipeline stay green.",
    color: "border-emerald-700 hover:border-emerald-500",
    badge: "bg-emerald-900/40 text-emerald-300",
    recommended: true,
  },
  {
    seed: 42,
    title: "Rejected claim",
    caption: "Bad root fails the L1 verifier.",
    detail:
      "A bad post root reaches L1 but fails before canonical settlement. Open a batch card to inspect public inputs.",
    color: "border-yellow-700 hover:border-yellow-500",
    badge: "bg-yellow-900/40 text-yellow-300",
  },
  {
    seed: 17,
    title: "Fast rejection",
    caption: "Caught at the validity gate.",
    detail:
      "Invalid claim rejected at submit time — no fraud-proof game. Contrast with optimistic rollups' challenge window.",
    color: "border-orange-700 hover:border-orange-500",
    badge: "bg-orange-900/40 text-orange-300",
  },
  {
    seed: 99,
    title: "Mixed proofs",
    caption: "Accepted and rejected over a longer run.",
    detail:
      "Compare simulated prove time vs measured verify gas across several batches with mixed outcomes.",
    color: "border-violet-700 hover:border-violet-500",
    badge: "bg-violet-900/40 text-violet-300",
  },
];

export function demosForMode(mode: LabMode): DemoCard[] {
  return mode === "zk" ? ZK_DEMOS : OP_DEMOS;
}
