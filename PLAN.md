# Implementation Plan — Rollup Mechanics Lab

Historical build plan for the backend + frontend rebuild. **All phases complete.**

For current setup, protocol behaviour, and demo walkthrough see **[README.md](README.md)** and **[DEMO_GUIDE.md](DEMO_GUIDE.md)**.

---

## Status

| Phase | Scope | Status |
|-------|--------|--------|
| 0 | Opcode-diff spike | ✅ |
| 1 | Swap engines + L1 mocks + forge tests | ✅ |
| 2 | Go backend (bots, sequencer, watcher, challenge, REST/WS) | ✅ |
| 3 | Next.js frontend rebuild | ✅ |
| 4 | Reproducibility tests + demo flows | ✅ |
| 5 | Cleanup, Makefile, docs | ✅ |
| 6 | Work orders WO-1…WO-8 (ledger, ZK, fraud proof, bonds, pedagogy) | ✅ |
| 7 | Education audit UX pass (OP state machine, ZK batch lane, docs) | ✅ |

---

## Phase 6 — Work orders (complete)

| WO | Title | Delivered |
|----|--------|-----------|
| WO-1 | Balance-set state roots | `SwapEngineStorage` commits all registered accounts; honest watcher + ZK ledger mirror `_recomputeRoot` |
| WO-2 | ZK lane honesty | Honest L2 engine; `ZkValidityVerifier` re-executes witness; `BuggySwapEngine` for honest-intent bugs rejected like fraud |
| WO-3 | Interactive fraud proof | `FraudProofGame` + `SwapStepVM`: Merkle bisection, on-chain one-step re-execution, no trusted `batchIsValid` arg |
| WO-4 | Source-map citations | `backend/internal/sourcemap` + OpcodeRace / BlockInspector show the exact Solidity line |
| WO-5 | Collateral waterfall | `OptimisticPortalMock` escrows bonds; winner paid; 10% of loser's stake burned; `bond_settled` WS event |
| WO-6 | Challenge window | 120s sim window; `FinalizeUnchallenged` returns honest bonds; UI countdown in Block Inspector |
| WO-7 | Pedagogy | Welcome banner, trace narration, Proof lab, bond/window copy in education data |
| WO-8 | Docs | README + DEMO_GUIDE + this file kept in sync with behaviour |

### Phase 7 — Education audit (complete)

Delivered per [docs/rollup-education-audit.md](docs/rollup-education-audit.md):

| Item | Delivered |
|------|-----------|
| OP flagged ≠ rejected | `OptimisticTracker` reroute phases; swap lifecycle `suspicious` / `in_dispute` |
| Manual challenge copy | ControlPanel, DemoGallery, WelcomeBanner, scoreboard watcher vs resolved metrics |
| ZK batch visualization | `ZkLane` + `ZkBatchGroup` on canvas; click opens `ZkInspect` |
| ZK commitments | Backend `zk_inspect_ready` payload + public-input panel in `ZkInspect` |
| ZK caveats | Validity / DA callouts on ZK canvas and in concept tour |
| Tests & layout | E2E for `/`, `/op`, `/zk`; responsive `LabPage` grids |

---

## Phase summaries (archive)

### Phase 0 — Spike ✅
Confirmed SSTORE divergence via `debug_traceTransaction` / `debug_traceCall`. Requires Anvil `--steps-tracing` and salient-opcode filtering.

### Phase 1 — Contracts ✅
- L2: `HonestSwapEngine`, `LyingSwapEngineObvious`, `LyingSwapEngineSubtle`, `BuggySwapEngine`, `SwapRouter`, `SwapEngineStorage`
- L1: `OptimisticPortalMock`, `FraudProofGame`, `SwapStepVM`, `ZkRollupMock`, `ZkValidityVerifier`
- Tests: `SwapEngines.t.sol`, `FraudProofGame.t.sol`, `OptimisticPortal.t.sol`, `ZkRollup.t.sol`, `ZkValidityVerifier.t.sol`

### Phase 2 — Go backend ✅
Anvil orchestration, seeded PRNG, swap/transfer bots, OP + ZK sequencers, honest watcher, trace capture/diff, user-triggered verification/challenge driving `FraudProofGame`, REST + WebSocket (`batch_verified`, `dispute_stage`, `bond_settled`, `batch_challenged`, …).

### Phase 3 — Frontend ✅
Home lab chooser, focused `/op` and `/zk` routes, OP/ZK grouped batch lanes on `BlockchainCanvas`, Block Inspector, OptimisticTracker, OpcodeRace fraud-proof overlay, ZkInspect (public inputs + caveats), Scoreboard, Demo Gallery, Welcome Banner, Research Panel (Proof lab), EventLogPanel. Overlays never auto-popup.

### Phases 4–5 ✅
Session reproducibility test, Makefile (`make dev`), legacy scripts under `bin/legacy/`, documentation rewrite.

---

## Dependency graph (original 19 tasks)

```
1 → 2, 3 → 4 → 5 → 6 → 7 → 8 → 9 → 10 → 11 → 12 → 18 → 19
13 → 14 → 15, 16, 17 → 18
```

Task 13 (frontend foundation) proceeded in parallel with backend Tasks 5–12.
