# Rollup Mechanics Lab

A live interactive demo of **optimistic and ZK rollup mechanics**: trades on L2, a lying sequencer, Merkle bisection fraud proofs, bond economics, and a real-time frontend that visualizes every step.

## Documentation

| Doc | Use when |
|-----|----------|
| **This file** | Setup, architecture, protocol constants, running tests |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Suggested live demo flow; macOS screen recording tips |
| [PLAN.md](PLAN.md) | Historical implementation plan + completed work orders |
| [docs/rollup-education-audit.md](docs/rollup-education-audit.md) | UX/education audit findings and fix checklist |
| [config/README.md](config/README.md) | Canonical dev ports (`config/ports.json`) |
| [.env.example](.env.example) | Public tunnel env for Vercel (no secrets / LAN) |
| [docs/cloudflare-tunnel.example.yml](docs/cloudflare-tunnel.example.yml) | Example `cloudflared` ingress (credentials stay off-repo) |

## How it works

1. **Three local chains** (L1 + OP-L2 + ZK-L2) are spawned by the Go backend using Anvil.
2. **Bots** send swap transactions to L2 swap engines.
3. The **OP sequencer** (seeded PRNG) batches txs, posts state roots to L1 with a **0.1 ETH bond**.
4. The **honest watcher** replays each batch; root mismatches emit `batch_flagged` (off-chain detection only — L1 does not reject until someone challenges).
5. The user opens a suspicious batch, clicks **Verify locally**, then chooses whether to post the L1 challenge bond and open `FraudProofGame` (Merkle bisection + on-chain step re-execution). The app never auto-challenges.
6. **Honest batches** finalize after a **120s challenge window** if undisputed; failed challenges slash the challenger and successful challenges reject the bad root.
7. The **ZK sequencer** batches L2 swaps, posts a header + witness to `ZkRollupMock`, and `ZkValidityVerifier` re-executes the witness on L1 (stand-in for a succinct proof) — no challenge window.
8. The **frontend** opens to a lab chooser, then streams WebSocket events into focused optimistic (`/op`, alias `/optimistic`) and ZK (`/zk`) labs. OP: grouped batch canvas, Block Inspector, Optimistic Tracker (swap lifecycle + bond ledger), opcode walkthroughs. ZK: grouped proof-batch canvas (click to open concept tour), public-input panel in `ZkInspect`, validity/DA caveats.

## Protocol summary

Constants mirror `app/data/protocol.ts` and `contracts/l1/OptimisticPortalMock.sol`.

| Mechanism | Sim value | Production analogy |
|-----------|-----------|-------------------|
| Sequencer bond | 0.1 ETH | Economic stake on each posted batch |
| Challenger bond | 0.1 ETH | Cost to open a dispute |
| Challenge window | 120 s | ~7 days on mainnet OP Stack |
| Fraud slashing burn | 10% of loser's bond | Anti-griefing; winner takes the pot minus burn |
| Batch window | 5 L2 blocks | One state root per batch |
| Demo L2 origin | After first post-start L1 block | Deploy/seed blocks are excluded; batch 0 starts at L2 #0 |
| OP fraud injection rate | ~1 in 8 batches | Tuned high for short demo runs |
| ZK invalid-claim rate | ~1 in 16 batches | Half the OP rate by design |
| OP fraud path | Watcher flag → user verify → `FraudProofGame` | Detection ≠ resolution; challenges are manual |
| ZK validity path | `ZkValidityVerifier` witness | Validity proof at submission; rejected claims never finalize |

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

`block_mined` · `batch_posted` · `batch_flagged` · `batch_verified` · `batch_challenged` · `dispute_stage` · `dispute_resolved` · `bond_settled` · `zk_inspect_ready` · `session_state_changed` · `error_occurred`

## Quick start

```bash
make install   # Foundry + pnpm + Playwright chromium
make dev       # stops stale ports from config/ports.json, then backend + frontend
```

If `make dev` fails with **address already in use**, run `make stop` and retry.

### Dev ports

All local ports live in **[config/ports.json](config/ports.json)** (see [config/README.md](config/README.md)):

| Service | Port |
|---------|------|
| Next.js frontend | **3001** |
| Go API + WebSocket | **8080** |
| Anvil L1 / OP L2 / ZK L2 | **8545** / **9545** / **10545** |

`make dev`, `make stop`, the Go backend, `app/data/ports.ts`, and `bin/.env.sh` read this file so nothing drifts to generic `3000`/`8000` ports. Change ports there when running multiple projects on one machine.

Open the frontend URL from that file (default [http://127.0.0.1:3001](http://127.0.0.1:3001)), then choose **Optimistic Rollup Lab** or **ZK Rollup Lab**. Direct routes: `/op`, `/optimistic`, `/zk`.

The frontend needs the Go backend on the **backend.port** from the same file (REST + WebSocket). If the control panel stays on “connecting to backend…” or shows a red **disconnected** dot, the API is not running — use `make dev` (both processes) or `make backend` alongside `make frontend`.

### Troubleshooting connection

| Symptom | Likely cause | Fix |
|---------|----------------|-----|
| “connecting to backend…” then **backend unreachable** | Only Next.js is running (`pnpm dev`) | `make dev` or `make backend` in a second terminal |
| **backend offline** after `vercel env pull` | `.env.local` has `NEXT_PUBLIC_API_URL=same-origin` / tunnel WS, but local Next does not proxy `/api` | Clear those vars from `.env.local` (local `next dev` now ignores them unless `ETH_L2_ENABLE_API_PROXY=1`) and hard-refresh |
| Red **disconnected** in header | Same — nothing listening on `:8080` | `lsof -nP -iTCP:8080 -sTCP:LISTEN` should show the Go `server` process |
| Stale port after a crash | Old node/go process still bound | `make stop` then `make dev` |
| Hosted frontend, MacBook API offline | Tunnel / Go not running | UI still loads as an explainer; status shows **backend offline**; Start stays disabled until `https://api-staging-eth-l2.magro.dev/health/ready` returns `READY` |

Smoke-check the API:

```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/health/ready
curl -s http://127.0.0.1:8080/api/state
```

`/health` should return JSON `{"ok":true,"service":"eth-l2","status":"up"}`. `/health/ready` should return plaintext `READY`. `/api/state` should report `"running":false` and empty `batches`.

### Terminal options

**1 terminal (recommended):** `make dev`

**2 terminals (debugging):** `make backend` + `make frontend`

**E2E tests:** backend + frontend running, then `make test-e2e` (or `pnpm test:e2e` — Playwright starts the frontend automatically if configured in `playwright.config.ts`).

## Hosted split (Vercel + MacBook)

Long-running work (Go API, Anvil L1/OP/ZK, WebSocket `/stream`, fraud/ZK compute) stays on the MacBook. The interactive UI deploys to Vercel and reaches the API only through the public Cloudflare Tunnel hostname — never a LAN IP.

```
Visitor browser
  → Vercel (Next.js UI)
  → same-origin /api/* + /health*  (Next rewrites)
  → https://api-staging-eth-l2.magro.dev
  → http://127.0.0.1:8080 on MacBook
```

WebSockets use `wss://api-staging-eth-l2.magro.dev/stream` directly (Vercel rewrites do not proxy WS upgrades).

### MacBook backend

```bash
./scripts/start-staging-backend.sh
# or: make backend-mbp
# durable across logins/crashes:
./scripts/install-backend-launch-agent.sh
```

Requires Foundry (`anvil`) on `PATH`. Binds `127.0.0.1:8080` by default.

| Probe | Expect |
|-------|--------|
| `GET /health` | JSON `ok` / `up` |
| `GET /health/live` | `OK` |
| `GET /health/ready` | `READY` (anvil on PATH) |

Logs when using launchd: `~/Library/Logs/eth-l2/`.

### Cloudflare Tunnel

Point the public hostname at localhost (credentials stay outside the repo):

```bash
# after tunnel create + DNS route for api-staging-eth-l2.magro.dev
cloudflared tunnel run --url http://127.0.0.1:8080 <TUNNEL_NAME>
```

See [docs/cloudflare-tunnel.example.yml](docs/cloudflare-tunnel.example.yml). Acceptance: `curl -s https://api-staging-eth-l2.magro.dev/health/ready` returns `READY`.

### Vercel frontend

Set project env from [.env.example](.env.example) (public values only):

| Variable | Value |
|----------|--------|
| `ETH_L2_BACKEND_ORIGIN` | `https://api-staging-eth-l2.magro.dev` |
| `NEXT_PUBLIC_API_URL` | `same-origin` |
| `NEXT_PUBLIC_WS_URL` | `wss://api-staging-eth-l2.magro.dev/stream` |

Optional on the MacBook: `ETH_L2_ALLOWED_ORIGINS=https://<your-vercel-app>.vercel.app` to lock CORS.

If the tunnel is down, the Vercel UI still loads; home/lab show an explicit **backend offline** state and interactive Start/demo controls stay disabled.

### Idle stop (no viewers)

When the last lab WebSocket client disconnects (tab closed, left `/op` or `/zk`), the backend waits **45s** then calls `Stop()` — Anvil chains and the tick loop shut down so a forgotten Vercel session does not keep mining. Reconnect within the grace window cancels the stop (tab refresh / brief tunnel blip).

Override: `ETH_L2_IDLE_STOP_SECONDS` (default `45`; `0` disables).

### First demo

1. Open the **Optimistic Rollup Lab** from the home chooser.
2. Read the **How this lab works** welcome banner (note: a watcher flag is not an L1 challenge).
3. Click **Mostly honest** (seed 88) or **Obvious fraud** (seed 17) in the Demo Gallery, or set seed **42** and press **Start simulation**.
4. Watch batch colours on the OP lane; click a batch → **Verify locally** → **Challenge on L1** if a mismatch is found.
5. Use **Optimistic Tracker** for swap lifecycle, reroute diagram, and bond ledger; **Block Inspector** for window countdown.
6. After fraud resolves (red), open **Walk opcode proof step-by-step** or **Proof lab**.

For ZK: open `/zk`, start a demo, click a proof batch on the canvas or in Proof lab to tour public inputs and verifier results.

Default speed: **3×**. Default seed: **42**. Optional **60s / 120s session timer** stops the sim (tears down Anvil) when it expires. Closing the lab tab also stops the session after a short grace period (no WebSocket clients).

## Prerequisites

- **Foundry** — [getfoundry.sh](https://getfoundry.sh) or `brew install foundry`
- **Go 1.22+** — [go.dev](https://go.dev/dl/)
- **Node.js 20+ + pnpm** — `npm install -g pnpm`

## Makefile targets

| Target | Description |
|--------|-------------|
| `make dev` | Go backend + Next.js frontend (recommended) |
| `make stop` | Kill stale processes on all ports from `config/ports.json` |
| `make backend` | Go backend only |
| `make backend-mbp` | Go on `127.0.0.1` for Cloudflare Tunnel staging |
| `make install-launch-agent` | Durable launchd agent (`KeepAlive` + `RunAtLoad`) |
| `make uninstall-launch-agent` | Remove the launchd agent |
| `make frontend` | Next.js on `config/ports.json` → `frontend.port` |
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
  cmd/server/       HTTP (config/ports.json backend.port) + WebSocket /stream
  internal/
    config/         Loads config/ports.json
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
  op/ zk/           Focused lab routes (+ home chooser at /)
  components/       LabFrame, LabPage, BlockchainCanvas, OpBatchGroup, ZkBatchGroup,
                    BlockInspector, OptimisticTracker, OpcodeRace, ZkInspect,
                    WelcomeBanner, ResearchPanel, Scoreboard, EventLogPanel, …
  data/             batchEducation, opTrackerEducation, traceNarrative, zkEducation, protocol, ports
  lib/              WS client, reducer, opLedger, URL helpers
config/             ports.json — canonical dev ports
```

Backend env (optional): `GOAPI_ADDR`, `PORT`, `ETH_L2_ALLOWED_ORIGINS`, `ETH_L2_API_TOKEN` (see [backend/README.md](backend/README.md)). Frontend / Vercel: see [.env.example](.env.example).

## Seeds

| Seed | Demo card | Behaviour |
|------|-----------|-----------|
| 88 | Mostly honest | Low dispute density; good first look at post → verify → finalize |
| 42 | Subtle fraud | Fee-rounding SSTORE lie |
| 17 | Obvious fraud | Wrong output amount; fast divergence |
| 99 | Mixed | Both fraud types over a long run |

## Tests

```bash
make test              # 60 forge + all Go packages
make test-contracts    # FraudProofGame, Portal bonds, SwapEngines, ZkValidityVerifier, …
make test-go
make test-e2e          # Playwright layout tests for /, /op, /zk (+ mobile/tablet viewports)
```

## Why this tech stack?

### Foundry
Rollup mechanics live on-chain. **Foundry** compiles Solidity mocks (`FraudProofGame`, `ZkValidityVerifier`, swap engines) and runs `forge test` in one command — same language family as OP Stack / zkSync.

### Anvil
Three chains with instant finality. **`--steps-tracing`** and `debug_traceCall` power the watcher and opcode diff.

### Go
One binary coordinates Anvil, bots, sequencers, watcher, local verification, user-triggered challenges, and finalization. `go-ethereum` handles ABI encoding and transaction lifecycle.

### Next.js + Tailwind v4 + Framer Motion
Client-side reducer over a WebSocket event stream; motion for block entry and proof overlays.

### Seeded PRNG
`keccak256`-chain PRNG with fork-safe sub-streams — same seed ⇒ same fraud pattern for repeatable demo sessions.

### Playwright
Layout regressions for the home chooser, OP lab, and ZK lab across idle, mobile (375px), and tablet (768px) viewports; screenshots under `public/screenshots/`.
