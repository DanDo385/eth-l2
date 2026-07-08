import Link from "next/link";
import { API_BASE, FRONTEND_URL } from "./data/ports";

export default function Home() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <section className="mx-auto flex min-h-screen w-full max-w-6xl flex-col justify-center gap-8 px-6 py-12">
        <div className="max-w-3xl space-y-4">
          <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">
            Rollup Mechanics Lab
          </p>
          <h1 className="text-4xl font-black tracking-tight text-zinc-50 sm:text-6xl">
            Choose the security model you want to inspect.
          </h1>
          <p className="max-w-2xl text-sm leading-7 text-zinc-400">
            One app, one backend, two focused labs. Optimistic rollups accept a
            proposed state unless someone successfully challenges during a
            window. ZK rollups require a validity proof before the state update
            is accepted.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Link
            href="/op"
            className="group rounded-2xl border border-blue-900/70 bg-blue-950/20 p-6 transition hover:border-blue-500 hover:bg-blue-950/35"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-blue-300">
                Optimistic Rollup Lab
              </p>
              <span className="rounded-full border border-blue-700 px-2 py-1 text-[10px] font-mono text-blue-200">
                /op
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-bold text-zinc-50">
              Fraud proofs, challenge bonds, and withdrawal finality.
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
              <li>Proposed state is accepted unless challenged during a window.</li>
              <li>User verifies locally before risking a challenge bond.</li>
              <li>Dispute bisection, L1 settlement, and bond movement are visible.</li>
            </ul>
            <p className="mt-6 text-sm font-semibold text-blue-300 group-hover:text-blue-200">
              Open optimistic lab
            </p>
          </Link>

          <Link
            href="/zk"
            className="group rounded-2xl border border-emerald-900/70 bg-emerald-950/20 p-6 transition hover:border-emerald-500 hover:bg-emerald-950/35"
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-300">
                ZK Rollup Lab
              </p>
              <span className="rounded-full border border-emerald-700 px-2 py-1 text-[10px] font-mono text-emerald-200">
                /zk
              </span>
            </div>
            <h2 className="mt-5 text-2xl font-bold text-zinc-50">
              Proof generation, verifier checks, and settlement gating.
            </h2>
            <ul className="mt-4 space-y-2 text-sm leading-6 text-zinc-400">
              <li>State update is accepted only after proof verification.</li>
              <li>Invalid proofs fail at the L1 verifier, not in a fraud game.</li>
              <li>Proving costs, verification gas, and bridge status are tracked.</li>
            </ul>
            <p className="mt-6 text-sm font-semibold text-emerald-300 group-hover:text-emerald-200">
              Open ZK lab
            </p>
          </Link>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/70 p-4 text-xs leading-6 text-zinc-500">
          <p className="font-semibold text-zinc-300">Run locally</p>
          <p>
            Start the shared Go backend and Next.js frontend with{" "}
            <span className="font-mono text-zinc-300">make dev</span>. Frontend:
            <span className="font-mono text-zinc-300"> {FRONTEND_URL}</span>.
            Backend API and WebSocket:
            <span className="font-mono text-zinc-300"> {API_BASE}</span>.
          </p>
        </div>
      </section>
    </main>
  );
}
