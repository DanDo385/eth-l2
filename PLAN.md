# Implementation Plan — eth-l2 Rollup Mechanics Lab

Full 19-task plan for the backend + frontend rebuild. Phase 0 and Phase 1 are complete.
Recovered from session `24fc592e-0136-4c53-8953-89a7df7e0b98`.

---

## Status legend

- ✅ Complete
- 🔄 In progress
- ⏳ Pending

---

## Phase 0 — Spike ✅

### Task 1 ✅ — Opcode-diff thesis
Deployed `HonestSwap` + `LyingSwap` stubs, captured `debug_traceTransaction` on both,
confirmed SSTORE divergence is visible. Findings in `out/spike/SPIKE_FINDINGS.md`.

**Key mandatories discovered:**
- `--steps-tracing` flag is required on every Anvil or `structLogs` is empty.
- Salient-opcode filter (`SLOAD|SSTORE|CALL|*CALL|RETURN|REVERT|LOG*`) is required for alignment.
- `debug_traceCall` confirmed (~14 ms) for watcher honest-replay pattern.

---

## Phase 1 — Contracts ✅

### Task 2 ✅ — SwapEngine contracts
`contracts/l2/HonestSwapEngine.sol`, `LyingSwapEngineObvious.sol`, `LyingSwapEngineSubtle.sol`,
`SwapRouter.sol`, `ISwapEngine.sol`, `SwapEngineStorage.sol`.

- HonestSwap: 0.3 % fee (RATE=100, FEE_BPS=30).
- LyingObvious: 2× amountOut.
- LyingSubtle: skips fee, same bytecode shape.
- SwapRouter: delegatecall proxy; `sequencer` calls `setImplementation()` to swap engine.
- Shared storage layout via `SwapEngineStorage` — hot-swap preserves state.

### Task 3 ✅ — L1 contract tweaks
`DisputeGameMock.resolve(batchId, batchIsValid, divergencePoint bytes32)`:
- Invalid resolution requires `divergencePoint != 0`.
- Valid resolution requires `divergencePoint == 0`.
- `Game` struct stores `divergencePoint`; `GameResolved` event includes it.

### Task 4 ✅ — Forge tests
`test/SwapEngines.t.sol`: fee math, nonce enforcement, insufficient-balance revert,
state-root path-dependence, engine hot-swap preserving shared state, three distinct outcomes.
`test/DisputeGame.t.sol`: updated for new `resolve()` signature.

---

## Phase 2A — Go backend skeleton 🔄

### Task 5 ✅ — Go backend skeleton + Anvil orchestration
`backend/` with `go.mod` (module `github.com/dando385/eth-l2/backend`).

Files:
- `internal/chain/anvil.go` — `Anvil` struct, `Start()` / `Stop()`, port-free check,
  `--steps-tracing` included on every spawn, `ScaledChains(speed)` helper.
- `internal/chain/client.go` — per-chain `ethclient` + named-account `bind.TransactOpts`,
  `Deployer()` / `Sequencer()` / `Challenger()` / `Trader(i)`, `Reset()` via `anvil_reset` RPC.
- `internal/chain/deploy.go` — `DeployL1()` / `DeploySwapL2()` run `forge script --broadcast`,
  read output JSON written by script, return typed `Addresses` struct.
- `cmd/server/main.go` — finds repo root, spawns 3 Anvils, deploys, starts HTTP on `:8080`.
  `/healthz` only; all other handlers stubbed in later tasks.

Deploy scripts needed:
- `script/DeploySwapL2.s.sol` — deploys `HonestSwapEngine`, both lying engines, `SwapRouter`.

### Task 6 ✅ — Session lifecycle
`internal/engine/session.go`: state machine (`idle | running | paused`).

- `Start(ctx, seed, speed)` — spawns Anvils with speed-scaled block times, deploys, starts tickLoop.
- `Pause()` / `Resume()` — set flag; tickLoop checks it each tick.
- `Stop()` — cancels context, kills Anvils, closes clients.
- `Reseed(ctx, seed)` — Stop + Start with new seed (chain state wiped via `anvil_reset`).

`internal/seed/prng.go`: keccak256-based deterministic PRNG.

- `New(seed uint64) *PRNG`
- `Uint64() uint64` — advances state, returns next 8 bytes.
- `Intn(n int) int`
- `KeccakDerive(domain string) [32]byte` — domain-tagged derivation (used for fraud injection).

---

## Phase 2B — Bots + Sequencer + Watcher ⏳

### Task 7 ✅ — Bots
`internal/bots/transfer.go` — L1: 2–4 ETH transfers per 12 s block.
`internal/bots/swap.go` — L2: 1 swap per 2 s block, traders drawn from seeded PRNG.

Rules:
- All randomness from the seeded PRNG, fixed tick order — no goroutines per bot.
- L1 emits 2–4 ETH transfers per block. L2 emits 1 swap per block.

### Task 8 ✅ — Sequencer (OP + ZK) with fraud injection
`internal/sequencer/op.go`:
- Every N L2-OP blocks, builds a batch (swap tx hashes + state root).
- Chooses engine: `honest | obvious | subtle` via `keccak(seed, batchId) % 3`
  (0 = honest, 1 = obvious lie, 2 = subtle lie).
- Calls `SwapRouter.setImplementation()` before executing, posts batch to L1 Portal.

`internal/sequencer/zk.go`:
- Same shape; submits to `ZkRollupMock` with a stub proof blob.

### Task 9 ✅ — Honest watcher (yellow flagging)
`internal/watcher/honest.go`:
- Subscribes to `BatchPosted` events on L1.
- Re-executes each batch's txs via `debug_traceCall` against `HonestSwapEngine`.
- Computes expected state root, compares with posted root.
- On mismatch: emits `batch_flagged` event with `color=yellow`. (Auto-challenge wired in Task 11.)

---

## Phase 2C — Trace capture + Challenge ✅

### Task 10 ✅ — Trace capture + diff
`internal/trace/capture.go` — `debug_traceTransaction` + `debug_traceCall` wrappers
(`disableMemory: true`, others false).

`internal/trace/filter.go` — salient-opcode filter:
- Keep: `SLOAD | SSTORE | CALL | STATICCALL | DELEGATECALL | RETURN | REVERT | LOG0..LOG4`.
- Drop all other ops; this is mandatory (raw traces diverge at JUMP compilation artifacts).

`internal/trace/diff.go` — walk two filtered traces in lockstep:
- Compare `op + stack_top_4 + storage_changes` at each step.
- Return first divergence index + `DivergenceReason{op, slot, honestVal, claimedVal}`.

### Task 11 ✅ — Challenge flows (auto + manual)
`internal/challenge/auto.go`:
- Triggered when watcher emits `batch_flagged (yellow)`.
- Runs bisection rounds against `DisputeGameMock`.
- Calls trace diff at leaf; commits `divergencePoint = keccak(step, op, slot, vals)`.
- Calls `DisputeGame.resolve(batchId, false, divergencePoint)`.
- Emits `dispute_resolved` event with full `opcodeDiff` payload.

`internal/challenge/manual.go`:
- Handles `POST /api/challenge` from frontend (Task 12).
- Same bisection + resolve flow as auto, but triggered on demand.

---

## Phase 2D — REST + WebSocket server ✅

### Task 12 ✅ — REST + WebSocket server
`internal/server/rest.go` — 9 endpoints:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/start` | Start session (seed, speed) |
| POST | `/api/pause` | Pause |
| POST | `/api/resume` | Resume |
| POST | `/api/stop` | Stop |
| POST | `/api/reseed` | Reseed |
| POST | `/api/challenge` | Manual challenge |
| GET | `/api/state` | Full state snapshot |
| GET | `/api/batch/:id` | Batch detail + opcodeDiff |
| GET | `/healthz` | Health check |

`internal/server/ws.go` — `/stream` WebSocket hub broadcasting typed `Event` union.
`internal/store/store.go` — in-memory snapshot for `/api/state`.

Event types: `block_mined`, `batch_posted`, `batch_flagged`, `dispute_resolved`,
`zk_inspect_ready`, `session_state_changed`.

---

## Phase 3 — Frontend rebuild ✅

### Task 13 ✅ — Frontend WS client, reducer, ControlPanel, AccountSidebar
`app/lib/ws.ts` — reconnecting WebSocket client.
`app/lib/reducer.ts` — typed event reducer.
`app/lib/store.tsx` — React context wrapper.
`app/lib/url.ts` — URL hash parsing (`seed`, `speed`, `autostart`, `hideControls`).

Components:
- `ControlPanel.tsx` — Start/Pause/Resume/Stop/Reseed; seed input; speed slider.
- `AccountSidebar.tsx` — live balances for deployer, sequencer, challenger, traders.

Wire against a mock WS feed initially so frontend progresses in parallel with backend.

### Task 14 ✅ — Three-lane BlockchainCanvas + BlockBox + BlockInspector
`BlockchainCanvas.tsx` — three `Lane` instances (L1, OP-L2, ZK-L2).
`BlockBox.tsx` — renders white (normal) / yellow (flagged) / orange (disputed) blocks
with framer-motion entry animation as new `block_mined` events arrive.
`BlockInspector.tsx` — side panel: tx list + batch metadata, opened by clicking a block.

Delete old components: `L1Mainnet`, `L2Optimistic`, `L2ZK`, `TransactionFlow`,
`BatchCompaction`, `DeepWeedsDemoDirector`, `FraudProofWar` (replaced by new surfaces).

### Task 15 ✅ — OpcodeRace overlay (twin tapes + divergence freeze)
`OpcodeRace.tsx`:
- Two horizontal tapes scrolling at ~15 boxes/sec.
- Green pulse on each matched op pair.
- Hard-stop at `divergenceIndex`: 1.5× zoom, red vertical divider.
- Callout panel with storage slot, honest value, claimed value, op name.
- Triggered by `dispute_resolved` event or clicking a resolved batch in BlockInspector.

### Task 16 ✅ — ZkInspect panel (4-stage proof animation)
`ZkInspect.tsx`:
- Triggered by clicking a ZK batch.
- Four stages animate sequentially: commit trace → witness → prove → verify.
- Compute timer + constraint count growing during prove stage.
- Reads `zk_inspect_ready` event; final state shows total gas + verify gas.

### Task 17 ✅ — Scoreboard + DemoGallery + URL hash plumbing
`Scoreboard.tsx` — running OP vs ZK totals: challenges issued, gas used, finality time.
`DemoGallery.tsx` — four seed cards (42 / 88 / 17 / 99) with captions; click auto-starts.
URL hash: read `seed/speed/autostart/hideControls` on mount; write `seed` on Reseed.

---

## Phase 4 — Reproducibility + Demo recordings ✅

### Task 18 ✅ — Reproducibility test + curated demo recordings
Go test `backend/internal/engine/session_test.go`:
- Spawn two sessions with `seed=42`, capture all events except timestamps.
- Hash both event streams; assert equal.

Record 4 WebM clips at `speed=4`:
- Seeds 42 / 88 / 17 / 99, ~25–30 s each.
- Place under `public/demos/`.

---

## Phase 5 — Cleanup ✅

### Task 19 ✅ — Cleanup, Makefile, README, DEMO_GUIDE rewrite
- Move `bin/run_op.sh`, `run_zk.sh`, `analyze.sh` → `bin/legacy/`.
- Update Makefile: `make dev` = `go run ./backend/cmd/server` + `pnpm dev`.
- Drop `make pipeline`.
- Rewrite `README.md` and `DEMO_GUIDE.md` around the new live-backend flow.
- Confirm `forge test && go test ./... && pnpm build` all pass.
- Delete `contracts/spike/` and `bin/spike_diff.sh` (spike artifacts).

---

## Dependency graph

```
1 → 2, 3
2, 3 → 4
4 → 5
5 → 6
6 → 7
7 → 8
8 → 9
9 → 10
10 → 11
11 → 12
12 → 18
13 → 14
14 → 15, 16, 17
17 → 18
18 → 19
```

Task 13 (frontend foundation) is independent of the backend chain and can proceed in parallel
with Tasks 5–12.
