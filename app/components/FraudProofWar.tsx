"use client";

import { motion } from "framer-motion";
import type { OpDispute } from "../types";

interface FraudProofWarProps {
  dispute?: OpDispute;
}

const OPCODE_TRACE = [
  { step: 19, op: "SLOAD", honest: "0x8f12", claimed: "0x8f12", verdict: "match" },
  { step: 20, op: "SWAP", honest: "0x42aa", claimed: "0x42aa", verdict: "match" },
  { step: 21, op: "SSTORE", honest: "0xef151", claimed: "0xef1ff", verdict: "mismatch" },
];

export function FraudProofWar({ dispute }: FraudProofWarProps) {
  return (
    <section className="rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-950/30 via-zinc-950/80 to-red-950/30 p-5 shadow-xl shadow-red-950/20">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-xs uppercase tracking-[0.25em] text-amber-300">deep-weeds · fraud proof visual</div>
          <h2 className="mt-1 text-xl font-bold text-zinc-100">Challenge as a card game: find the one lying step</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-zinc-400">
            The sequencer and challenger narrow the execution trace like War: each round reveals a smaller interval until one opcode proves the posted state root is wrong.
          </p>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/30 px-4 py-3 text-sm text-zinc-400">
          <div className="font-semibold text-zinc-100">Batch {dispute?.batchId ?? 1}</div>
          <div>{dispute?.rounds.length ?? 4} bisection rounds</div>
          <div className="mt-1 text-amber-300">{dispute?.result ?? "RESOLVED_INVALID"}</div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-3">
        {OPCODE_TRACE.map((row, index) => (
          <motion.div
            key={row.step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.12 }}
            className={`rounded-xl border p-4 ${row.verdict === "mismatch" ? "border-red-500/60 bg-red-950/30" : "border-emerald-500/25 bg-emerald-950/15"}`}
          >
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-zinc-500">step {row.step}</span>
              <span className={`rounded-full px-2 py-0.5 text-xs ${row.verdict === "mismatch" ? "bg-red-500/25 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                {row.verdict}
              </span>
            </div>
            <div className="mt-2 text-lg font-bold text-zinc-100">{row.op}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded bg-black/30 p-2">
                <div className="text-zinc-500">honest VM</div>
                <div className="font-mono text-emerald-300">{row.honest}</div>
              </div>
              <div className="rounded bg-black/30 p-2">
                <div className="text-zinc-500">claimed VM</div>
                <div className="font-mono text-amber-300">{row.claimed}</div>
              </div>
            </div>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
