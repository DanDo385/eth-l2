# Rollup Mechanics Lab

A live interactive demo of **optimistic and ZK rollup mechanics**: trades on L2, a lying sequencer, Merkle bisection fraud proofs, bond economics, and a real-time frontend that visualizes every step.

## Documentation

| Doc | Use when |
|-----|----------|
| **This file** | Setup, architecture, protocol constants, running tests |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Recording a ~2–3 min portfolio walkthrough (Loom) |
| [PLAN.md](PLAN.md) | Historical implementation plan + completed work orders |
| [AGENTS.md](AGENTS.md) | Agent / contributor conventions |

## How it works

1. **Three local chains** (L1 + OP-L2 + ZK-L2) are spawned by the Go backend using Anvil.
2. **Bots** send swap transactions to L2 swap engines.
3. The **OP sequencer** (seeded PRNG) batches txs, posts state roots to L1 with a **0.1 ETH bond**.
4. The **honest watcher** replays each batch; root mismatches emit `batch_flagged`.
5. The **auto-challenger** opens `FraudProofGame` on L1 (Merkle bisection + on-chain step re-execution), finalizes the batch, and settles bonds (`bond_settled`).
6. **Honest batches** finalize after a **120s challenge window** if undisputed; the sequencer recovers its bond.
7. The **ZK sequencer** submits batches with a witness to `ZkValidityVerifier` (re-execution stand-in for a succinct proof) — no challenge window.
8. The **frontend** streams WebSocket events into a three-lane canvas, Block Inspector (countdown + bond notes), Scoreboard, and Proof lab overlays (opcode walkthrough with source-map line citations).

## Protocol summary

Constants mirror `app/data/protocol.ts` and `contracts/l1/OptimisticPortalMock.sol`.

| Mechanism | Sim value | Production analogy |
|-----------|-----------|-------------------|
| Sequencer bond | 0.1 ETH | Economic stake on each posted batch |
| Challenger bond | 0.1 ETH | Cost to open a dispute |
| Challenge window | 120 s | ~7 days on mainnet OP Stack |
| Fraud slashing burn | 10% of loser's bond | Anti-griefing; winner takes the pot minus burn |
| Batch window | 5 L2 blocks | One state root per batch |
| OP fraud path | Watcher → `FraudProofGame` | Bisection + fault proof |
| ZK validity path | `ZkValidityVerifier` witness | Validity proof at submission |

### Key contracts

| Contract | Role |
|----------|------|
| `OptimisticPortalMock` | Batch posting, bonds, challenge window, finalization |
| `FraudProofGame` | Merkle bisection over swap-VM traces; `resolveOneStep` re-executes on L1 |
| `SwapStepVM` | Minimal step machine mirroring swap fee math |
| `HonestSwapEngine` / lying engines | L2 swap logic; router hot-swaps implementation |
| `ZkValidityVerifier` | Re-runs batch witness; rejects bad post-state (fraud or bug) |
| `ZkRollupMock` | ZK lane batch submission + canonical root |

### WebSocket events

`block_mined` · `batch_posted` · `batch_flagged` · `batch_challenged` · `dispute_resolved` · `bond_settled` · `zk_inspect_ready` · `session_state_changed` · `error_occurred`

## Quick start

```bash
make install   # Foundry + pnpm + Playwright chromium
make dev       # backend + frontend on :3001
```

Open [http://localhost:3001](http://localhost:3001).

### Terminal options

**1 terminal (recommended):** `make dev`

**2 terminals (debugging):** `make backend` + `make frontend`

**E2E tests:** backend + frontend running, then `make test-e2e` (or `pnpm test:e2e` — Playwright starts the frontend automatically if configured in `playwright.config.ts`).

### First demo

1. Read the **How this lab works** welcome banner.
2. Click **Clean run** (seed 88) or **Obvious fraud** (seed 17) in the Demo Gallery, or set seed **42** and press **Start simulation**.
3. Watch batch colours on the OP lane; open **Block Inspector** for window countdown and bond notes.
4. After fraud resolves (red), open **Walk opcode proof step-by-step** or **Proof lab**.

Default speed: **3×**. Default seed: **42**.

## Prerequisites

- **Foundry** — [getfoundry.sh](https://getfoundry.sh) or `brew install foundry`
- **Go 1.22+** — [go.dev](https://go.dev/dl/)
- **Node.js 20+ + pnpm** — `npm install -g pnpm`

## Makefile targets

| Target | Description |
|--------|-------------|
| `make dev` | Go backend + Next.js frontend (recommended) |
| `make stop` | Kill stale processes on ports 3001, 8080, and Anvil RPC ports |
| `make backend` | Go backend only |
| `make frontend` | Next.js on port 3001 |
| `make build` | Contracts + Go + Next.js |
| `make test` | `forge test` + `go test ./...` |
| `make test-contracts` | Forge verbose |
| `make test-go` | Go verbose |
| `make test-e2e` | Playwright (`pnpm exec playwright test`) |
| `make install` | All dependencies |
| `make clean` | Remove `out/`, `.next/`, screenshots |

## Architecture

```
contracts/
  l1/               OptimisticPortal, FraudProofGame, SwapStepVM, ZkRollup, ZkValidityVerifier
  l2/               Swap engines, SwapRouter, SwapEngineStorage
  shared/           Merkle, Hashing, DataTypes
backend/
  cmd/server/       HTTP :8080 (or GOAPI_ADDR) + WebSocket /stream
  internal/
    chain/          Anvil lifecycle, deploy, demo economics
    bots/           L1 transfers + L2 swaps
    sequencer/      OP (fraud injection) + ZK (honest ledger + witness)
    watcher/          Honest state-root replay
    challenge/      FraudProofGame driver, trace diff, bond settlement
    sourcemap/      PC → Solidity line (forge artifacts)
    trace/          debug_traceCall, filter, diff
    store/          Batch/block snapshot
    events/         Typed pub/sub bus
    seed/           Deterministic PRNG
    server/         REST + WebSocket
app/                Next.js 16
  components/       Canvas, Inspector, OpcodeRace, WelcomeBanner, ResearchPanel, …
  data/             batchEducation, traceNarrative, zkEducation, protocol
  lib/              WS client, reducer, URL helpers
```

Backend env (optional): `GOAPI_ADDR`, `PORT`, `ETH_L2_ALLOWED_ORIGINS` (CORS allowlist).

## Seeds

| Seed | Demo card | Behaviour |
|------|-----------|-----------|
| 88 | Clean run | All batches honest; finalize after challenge window |
| 42 | Subtle fraud | Fee-rounding SSTORE lie |
| 17 | Obvious fraud | Wrong output amount; fast divergence |
| 99 | Mixed | Both fraud types over a long run |

## Tests

```bash
make test              # 60 forge + all Go packages
make test-contracts    # FraudProofGame, Portal bonds, SwapEngines, ZkValidityVerifier, …
make test-go
make test-e2e          # 28 Playwright layout tests (7 describe blocks)
```

## Why this tech stack?

### Foundry
Rollup mechanics live on-chain. **Foundry** compiles Solidity mocks (`FraudProofGame`, `ZkValidityVerifier`, swap engines) and runs `forge test` in one command — same language family as OP Stack / zkSync.

### Anvil
Three chains with instant finality. **`--steps-tracing`** and `debug_traceCall` power the watcher and opcode diff.

### Go
One binary coordinates Anvil, bots, sequencers, watcher, and the challenge loop. `go-ethereum` handles ABI encoding and transaction lifecycle.

### Next.js + Tailwind v4 + Framer Motion
Client-side reducer over a WebSocket event stream; motion for block entry and proof overlays.

### Seeded PRNG
`keccak256`-chain PRNG with fork-safe sub-streams — same seed ⇒ same fraud pattern for repeatable recordings.

### Playwright
Layout and control regressions across idle, mobile, and tablet viewports; screenshots under `public/screenshots/`.
