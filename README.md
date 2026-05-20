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
