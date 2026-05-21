# Rollup Mechanics Lab

A live interactive demo of **optimistic and ZK rollup mechanics**: trades on L2, a lying sequencer, bisection-based fraud proofs, and a real-time frontend that visualizes every step.

## How it works

1. **Three local chains** (L1 + OP-L2 + ZK-L2) are spawned by the Go backend using Anvil.
2. **Bots** send swap transactions to L2 swap engines.
3. The **OP sequencer** (seeded PRNG controls honesty) batches txs and posts state roots to L1.
4. The **honest watcher** detects root mismatches and fires a `BatchFlagged` event.
5. The **auto-challenger** opens a dispute on L1, runs bisection, traces the diverging opcode, and calls `resolve()`.
6. The **frontend** receives all events over WebSocket and renders the live blockchain canvas, scoreboard, and opcode race replay.

## Quick start

```bash
# Install dependencies (Foundry + pnpm + Playwright browsers)
make install

# Start the Go backend + Next.js frontend together
make dev
```

Then open [http://localhost:3001](http://localhost:3001).

- Pick a **seed** in the control panel (or click a Demo Gallery card).
- Press **Start** — chains are created, contracts deployed, and bots begin trading.
- Watch batches appear on the canvas; flagged/challenged/resolved batches change colour.
- Click a batch to inspect it; click **Opcode Race** to replay the fraud-proof trace.

## Prerequisites

- **Foundry** (forge + anvil): [getfoundry.sh](https://getfoundry.sh) or `brew install foundry`
- **Go 1.22+**: [go.dev](https://go.dev/dl/)
- **Node.js 20+ + pnpm**: `npm install -g pnpm`

## Makefile targets

| Target | Description |
|--------|-------------|
| `make dev` | Start Go backend + Next.js frontend (recommended) |
| `make backend` | Go backend only (manages anvil + chains) |
| `make frontend` | Next.js dev server only (port 3001) |
| `make build` | Build contracts, Go binary, and Next.js |
| `make test` | Run forge tests + Go unit tests |
| `make test-contracts` | Forge tests with verbose output |
| `make test-go` | Go unit tests with verbose output |
| `make test-e2e` | Playwright E2E tests (requires dev server running) |
| `make install` | Install all dependencies |
| `make clean` | Remove build artefacts |

## Architecture

```
contracts/          Solidity — OptimisticPortal, DisputeGame, SwapEngines, ZkRollup
backend/
  cmd/server/       HTTP + WebSocket server entrypoint
  internal/
    chain/          Anvil process management, RPC client, deploy helpers
    bots/           Transfer bot + swap bots (seeded PRNG)
    sequencer/      OP sequencer (honest/lying), ZK sequencer
    watcher/        Honest state-root tracker (pure Go mirror of HonestSwapEngine)
    challenge/      Auto-challenger: bisection loop + trace diff + resolve
    trace/          debug_traceCall wrapper, Filter, Diff, commitDivergence
    store/          In-memory batch/block state (thread-safe)
    events/         Typed pub/sub bus
    seed/           Deterministic PRNG (keccak256 chain, fork-safe)
    server/         REST endpoints + WebSocket hub
app/                Next.js 16 frontend
  components/       BlockchainCanvas, OpcodeRace, Scoreboard, DemoGallery, …
  lib/              WS client, reducer, URL hash helpers
```

## Seeds

| Seed | Behaviour |
|------|-----------|
| 42 | Subtle fraud — fee rounding in SSTORE |
| 88 | Honest run — all batches resolve clean |
| 17 | Obvious fraud — wrong output amount |
| 99 | Mixed — both fraud types appear |

## Tests

```bash
make test-contracts   # 49 Solidity tests (DisputeGame, Portal, SwapEngines, ZkRollup, TradeEngine)
make test-go          # Go unit tests (seed, store, trace, watcher, engine)
make test-e2e         # 28 Playwright tests across 7 describe blocks
```

## Why this tech stack?

Every tool here was chosen to make the educational goal — *showing exactly what a rollup does, step by step* — as clear and reproducible as possible.

### Foundry (Solidity contracts)
Rollup mechanics live on-chain: fraud-proof disputes, ZK verifiers, swap engines, and state-root commitments are all L1/L2 contracts. **Foundry** lets us write those contracts in Solidity (the language of production rollups like OP-Stack and zkSync) and test them with `forge test` in a single command. Mock contracts (`DisputeGameMock`, `VerifierMock`, `LyingSwapEngine`) keep the demo deterministic without the complexity of a production prover or challenge game.

### Anvil (local EVM nodes)
Three chains (L1, OP-L2, ZK-L2) need to run locally with instant finality so the demo completes in seconds rather than days. **Anvil** is a development-only EVM node from the Foundry suite that supports `anvil_mine` (manual block production), `--steps-tracing` (opcode-level execution traces), and `debug_traceCall` with state overrides — all the hooks the challenger and tracer need to reconstruct and diff execution paths.

### Go (backend)
The backend coordinates five concurrent concerns: Anvil process lifecycle, RPC polling, bot transactions, sequencer batching, and the fraud-proof challenge loop. **Go** is a natural fit because its goroutine model maps cleanly onto "one goroutine per chain" polling, its typed struct system gives rigorous wire-type safety between chain and event bus, and the entire binary ships as a single self-contained executable. Go is also the language of Geth (the dominant Ethereum client), so the `go-ethereum` SDK gives us full access to ABI encoding, transaction signing, and `bind.WaitMined` out of the box.

### Next.js + TailwindCSS v4 + Framer Motion (frontend)
The frontend needs to respond to a stream of real-time events (blocks mined, batches flagged, disputes resolved) and animate them into a coherent visual narrative. **Next.js** with the App Router gives us React Server Components for static shell and client components for live state, all in one codebase. **TailwindCSS v4** keeps styling co-located with markup — every `border-red-500` on a flagged block is readable at a glance. **Framer Motion** handles the animated elements (block boxes sliding in, FRAUD flash overlays, the opcode race tape) without requiring manual `requestAnimationFrame` loops.

### WebSocket pub/sub event bus
The backend never pushes HTML — it publishes typed events (`block_mined`, `batch_posted`, `dispute_resolved`, …) over a single WebSocket. The frontend's `useReducer` accumulates them into app state. This separation mirrors what a real L2 dashboard would look like: an indexer emitting events, a client rendering them. It also makes testing easy — the reducer is a pure function you can unit-test without a network.

### Seeded PRNG (`seed/`)
Reproducibility is the whole point of a lab. A **keccak256-chain PRNG** means seed `42` always produces the same sequence of honest/lying sequencer decisions, bot trade amounts, and proof nonces. Fork-safe sub-streams (`prng.Fork("op-swap")`) ensure that changing the number of bots does not shift the sequencer's random draws, so each demo URL is a stable, shareable scenario.

### Playwright (E2E tests)
The UI correctness that matters is "does the batch turn red after a fraud proof?" — something a unit test of the reducer cannot fully answer. **Playwright** drives a real Chromium browser against the live dev server, waits for WebSocket events, and asserts DOM state. The 28 E2E tests cover all four demo seeds and the full block → batch → flag → challenge → resolve lifecycle, giving confidence that visual regressions are caught before recording a Loom.
