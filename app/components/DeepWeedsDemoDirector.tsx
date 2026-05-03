"use client";

const beats = [
  ["0:00-0:20", "Why rollups matter", "L2s are faster and cheaper, but someone has to keep the sequencer honest."],
  ["0:20-0:55", "Trades become batches", "Show Layer3 trades moving through optimistic and ZK lanes."],
  ["0:55-1:35", "Bad batch appears", "Point at the wrong state root and explain the challenge window."],
  ["1:35-2:25", "Bisection finds the lie", "Use the War-style opcode trace to show the precise mismatch."],
  ["2:25-3:00", "Hiring signal", "This demo connects Solidity mocks, local chains, artifacts, and an explanatory UI."],
];

export function DeepWeedsDemoDirector() {
  return (
    <section className="mb-8 rounded-2xl border border-fuchsia-500/30 bg-gradient-to-r from-fuchsia-950/40 via-zinc-950 to-cyan-950/40 p-5">
      <div className="text-xs uppercase tracking-[0.25em] text-fuchsia-300">deep-weeds · 150-180 second Loom spine</div>
      <h2 className="mt-1 text-2xl font-bold text-zinc-100">Catch the lying sequencer</h2>
      <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-400">
        This is the technical credibility demo. Do not sell it as a generic L2 dashboard. Sell it as a security mechanism made visible:
        optimistic execution is fast because it assumes honesty, and fraud proofs make dishonesty expensive.
      </p>
      <div className="mt-4 grid gap-3 lg:grid-cols-5">
        {beats.map(([time, title, detail]) => (
          <div key={time} className="rounded-lg border border-white/10 bg-black/30 p-3">
            <div className="font-mono text-xs text-fuchsia-300">{time}</div>
            <div className="mt-1 text-sm font-semibold text-zinc-100">{title}</div>
            <p className="mt-1 text-xs leading-5 text-zinc-500">{detail}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
