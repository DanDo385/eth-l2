# ETH-L2 Rollup Education Audit

## Executive Summary

The app is conceptually sound in its backend model and strongest on the optimistic rollup path. It actually models L2 swaps, batch posting, L1 state root assertions, watcher replay, local verification, challenge bonds, a fraud proof game, and bond settlement. The OP page has enough raw material to teach the mechanism well.

The current product is not yet ready for a general learner. It is partially misleading in a few important UI states. The biggest OP issue is that a watcher-flagged batch is sometimes visually treated as already rejected or rolled back, which collapses "detected" into "challenged" and "resolved." That directly conflicts with the key optimistic rollup lesson that challenges are actor-triggered, not automatic.

The ZK page is accurate in copy but underbuilt as a learning product. It says ZK batches feed a prover and L1 verifies validity, but the live canvas does not visually group ZK blocks into batches, does not make ZK batches clickable, and does not surface the actual L1 commitments emitted by the mock rollup. The ZK experience is mostly a scorecard plus a modal after proof completion.

The app should keep OP and ZK structurally different. OP needs an adversarial timeline with challenge economics. ZK needs a proving pipeline with public inputs, proof generation, verifier result, and data availability caveats. Symmetry would reduce educational clarity.

## Repository / App Inspection

Framework and runtime:

- Next.js App Router, `next@16.2.6`, React 19, TypeScript.
- Static export is enabled in `next.config.ts` with `output: "export"`.
- Styling is Tailwind v4 via `app/globals.css`, with global `.btn-green`, `.btn-red`, and `.btn-zinc` component classes.
- Motion/overlays use `framer-motion`.
- Backend is Go, serving REST and WebSocket APIs. It orchestrates Anvil chains and deploys Solidity mocks.
- Contracts are Foundry Solidity mocks under `contracts/`.

Routes:

- `/` chooser page in `app/page.tsx`.
- `/op` optimistic lab in `app/op/page.tsx`.
- `/optimistic` alias in `app/optimistic/page.tsx`.
- `/zk` ZK lab in `app/zk/page.tsx`.

Shared frontend structure:

- `app/components/LabFrame.tsx` provides app store, header, error banner, and proof modals.
- `app/components/LabPage.tsx` composes left rail controls, chain canvas, scoreboard, OP tracker, proof lab, and event log.
- State lives in `app/lib/store.tsx` and `app/lib/reducer.ts`.
- REST/WebSocket URLs live in `app/lib/ws.ts`, defaulting to `http://localhost:8080`.

Key OP components:

- `BlockchainCanvas.tsx`: L1 and L2 lanes, OP batch grouping.
- `OpBatchGroup.tsx`: visual grouped OP batch cards.
- `BlockInspector.tsx`: selected OP batch status, roots, local verify, challenge button.
- `OptimisticTracker.tsx`: batch timeline, swap table, reroute diagram, L1 activity, bond ledger, source line exhibit, simplifications.
- `OpcodeRace.tsx`: opcode proof overlay.
- `batchEducation.ts`, `opTrackerEducation.ts`, `traceNarrative.ts`: OP education copy and helper logic.

Key ZK components:

- `BlockchainCanvas.tsx`: ZK mode currently renders generic block lane.
- `Scoreboard.tsx`: ZK submitted, verified, rejected, finality summary.
- `ResearchPanel.tsx`: proof list and ZK explanation block.
- `ZkContrastStrip.tsx`: OP vs ZK comparison strip.
- `ZkInspect.tsx`: three-step ZK concept tour.
- `zkEducation.ts`: ZK proof and verifier education copy.

Backend and contract mechanisms inspected:

- OP sequencer: `backend/internal/sequencer/op.go`.
- ZK sequencer: `backend/internal/sequencer/zk.go`.
- Challenge driver: `backend/internal/challenge/challenge.go`.
- OP portal: `contracts/l1/OptimisticPortalMock.sol`.
- Fraud proof game: `contracts/l1/FraudProofGame.sol`.
- ZK rollup mock: `contracts/l1/ZkRollupMock.sol`.
- ZK verifier stand-in: `contracts/l1/ZkValidityVerifier.sol`.

Subagents used:

- Optimistic Rollup accuracy and UX pass.
- ZK Rollup accuracy and UX pass.
- Frontend implementation and feasibility pass.

I reconciled their findings against the files above before writing this report.

## Verification Performed

Commands run and real outcomes:

| Command | Outcome |
|---|---|
| `find . -maxdepth 3 -type d` | Inspected repository structure. No `docs/` directory existed before this report. |
| `rg --files` | Enumerated application, backend, contract, test, and public screenshot files. |
| `make dev` | Started backend and frontend. Output included `Next.js 16.2.6`, local frontend `http://localhost:3001`, backend `HTTP server listening on :8080`, and served `GET /op 200` and `GET /zk 200` in the dev log. |
| `curl -I --max-time 5 http://localhost:3001/op` inside sandbox | Failed with `curl: (7) Failed to connect`. Impact: sandboxed local network probe was unreliable. |
| `lsof -nP -iTCP:3001 -sTCP:LISTEN` | Confirmed a `node` process listening on port 3001. |
| `lsof -nP -iTCP:8080 -sTCP:LISTEN` | Confirmed backend `server` process listening on port 8080. |
| `curl -I --max-time 5 http://127.0.0.1:3001/op` outside sandbox | Passed. Returned `HTTP/1.1 200 OK`. |
| `curl -I --max-time 5 http://127.0.0.1:3001/zk` outside sandbox | Passed. Returned `HTTP/1.1 200 OK`. |
| `pnpm exec playwright screenshot --browser chromium http://localhost:3001/op /tmp/eth-l2-op-audit.png` | Failed because Playwright Chromium binary was missing: `Executable doesn't exist ... chrome-headless-shell`. |
| `pnpm exec playwright install chromium` | Hung with no output for over 60 seconds and was interrupted. Impact: screenshot/browser automation was not available. Static code and HTTP verification continued. |
| `make build` | Passed. Ran `forge build`, `cd backend && go build ./...`, and `pnpm build`. Next build listed `/`, `/_not-found`, `/op`, `/optimistic`, `/zk`. Forge emitted lint notes but no build failure. |
| `make test` | Passed. Forge reported 60 Solidity tests passed. Go tests under `backend` passed. |

Important verification caveats:

- I did not complete Playwright visual screenshot verification because browser binaries were missing and browser installation did not complete.
- I inspected runtime availability by `make dev`, dev server logs, `lsof`, and escalated local `curl`.
- I did not manually click through a browser UI because the available Playwright browser tooling could not launch a browser.

## First-Principles Mental Model

L2 transactions:

- Users or bots submit transactions to L2 execution.
- L2 execution updates L2 state quickly and cheaply.
- The key teaching point is that L1 does not execute every L2 transaction in the normal rollup path.

Batching:

- A sequencer collects multiple L2 transactions into a batch.
- The batch has a block range, transaction count, transaction data commitment, and a claimed post-state commitment.
- This app uses `BATCH_WINDOW = 5` L2 blocks in `app/data/protocol.ts` and `backend/internal/engine/session_state.go`.

L1 posting:

- OP path: `OptimisticPortalMock.postBatch` receives a batch header and raw transaction hash data, requires a sequencer bond, and emits `BatchPosted`.
- ZK path: `ZkRollupMock.submitBatch` receives a batch header plus witness data, runs the verifier stand-in, and emits `ZkBatchSubmitted`.

Commitments and state roots:

- A state root is a compact commitment to the resulting L2 state.
- In this app, the root summarizes swap engine storage/balances.
- OP posts a claimed root and assumes it can stand unless successfully challenged.
- ZK posts a claimed root that must satisfy the validity verifier before canonical root advancement.

Optimistic challenge flow:

- The sequencer posts a batch assertion/root with a bond.
- The system enters a challenge window.
- A watcher, validator, challenger, or participant must actively derive the expected state and detect a mismatch.
- Detection alone is not resolution.
- The challenger verifies locally, then submits an L1 challenge and posts a challenger bond.
- The fraud proof game narrows the disagreement to one step.
- If the sequencer is wrong, the bad assertion is rejected and the challenger is rewarded.
- If the challenge is wrong, the sequencer is upheld and the challenger is penalized.
- Finality is delayed because users must wait through the challenge window.

Bonds and economic incentives:

- In this app, the sequencer posts `0.1 ETH` when posting a batch.
- The challenger posts `0.1 ETH` when challenging.
- The loser bond is slashed with a `10%` burn in the mock model.
- This is a useful teaching simplification as long as it is clearly labeled as this app's model.

ZK proof generation and verification:

- A prover generates a validity proof off-chain.
- L1 verifier checks proof/public inputs.
- If verification succeeds, the state update is accepted in the simplified model.
- If verification fails, the state update is rejected.
- This app uses `ZkValidityVerifier` as a stand-in that re-executes the batch witness on L1 rather than verifying a succinct SNARK/STARK.

Finality differences:

- OP finality is delayed by the dispute window.
- ZK finality is gated by proof generation plus L1 verifier acceptance.
- "Immediate finality" in this app means immediate after verifier acceptance in the mock, not instant from user transaction submission and not necessarily final under all production bridge or L1 finality assumptions.

Acceptable simplifications if disclosed:

- Short challenge window.
- Small fixed batch window.
- Re-execution stand-in for ZK proof verification.
- Simplified bond amounts.
- Simplified fraud proof VM.
- Simplified bridge/withdrawal finality.
- Visual shorthand for re-sequencing valid swaps after rejecting a bad batch.

## Optimistic Rollup Page Audit

Critical findings:

- None found that make the overall OP mechanism fundamentally wrong. The backend and most copy model the correct optimistic flow: post first, challenge later, bond economics, bisection, one-step replay, and settlement.

High findings:

1. Flagged batches are sometimes visually treated as already rejected.
   - Files: `app/components/OptimisticTracker.tsx`, especially `RerouteDiagram`.
   - Evidence: `RerouteDiagram` sets `rejected = batch.resolved || batch.flagged`, then shows "L1 rejects root" and rejected/re-sequenced outcomes before a challenge resolves.
   - Why it matters: This teaches the wrong mental state. A watcher flag is off-chain detection, not L1 rejection. Optimistic rollups do not automatically reject a bad root just because a watcher found it.
   - Fix: Split states into "flagged off-chain", "challenge submitted", "rejected on L1". Only show rollback, slashing, and proof-recorded language for `batch.resolved`.

2. Challenge cadence copy can imply automatic challenges.
   - Files: `app/components/ControlPanel.tsx`, `WelcomeBanner.tsx`, `DemoGallery.tsx`.
   - Evidence: Copy says 60s "usually catches 1-2 OP disputes" or "1-2 challenges" while the actual UI requires manual verify and challenge through `BlockInspector`.
   - Why it matters: The user may believe disputes happen automatically, contradicting the core OP requirement that participants actively challenge.
   - Fix: Replace with "usually surfaces 1-2 suspicious batches for you to verify and challenge."

Medium findings:

1. Watcher detection and dispute resolution are blurred in the scoreboard.
   - File: `app/components/Scoreboard.tsx`.
   - Evidence: Detection rate uses `resolved / fraud`, but copy says it reaches 100% because the watcher catches every mismatch.
   - Why it matters: Detection and resolution are separate steps. A watcher can flag, but only a challenge and fraud proof resolve.
   - Fix: Rename to "OP fraud resolved" or compute a separate "watcher flag rate."

2. Challenger economics are present but under-summarized.
   - Files: `app/lib/opLedger.ts`, `app/components/OptimisticTracker.tsx`.
   - Evidence: Ledger tracks `challenger.returned`, but summary renders challenger posted and won only.
   - Why it matters: Correct vs incorrect challenge outcomes are one of the central economic lessons.
   - Fix: Add "returned" and "lost/slashed" in the challenger summary.

3. "State root", "output root", and "assertion" terminology is mixed without a clear bridge.
   - Files: `LabFrame.tsx`, `batchEducation.ts`, `ResearchPanel.tsx`.
   - Why it matters: New users may think these are unrelated objects.
   - Fix: Add a short glossary callout: "In this lab, the OP output root is represented by the posted state root commitment."

4. Simplifications are accurate but buried.
   - Files: `opTrackerEducation.ts`, `OptimisticTracker.tsx`.
   - Evidence: Simplifications sit in a collapsed `<details>` footer.
   - Why it matters: The app makes meaningful simplifications. Users should see them before generalizing to production rollups.
   - Fix: Add a visible "Demo simplifications" badge or compact summary near the top, with the footer as detail.

Low findings:

1. L2 transaction collection before batching is less inspectable than post-batch history.
   - Files: `OpBatchGroup.tsx`, `BlockchainCanvas.tsx`, `OptimisticTracker.tsx`.
   - Evidence: Pending blocks show dashed boxes with hover text, but swap detail appears after posting.
   - Fix: Add a small "current batch buffer" counter: pending L2 blocks, collected swaps, next post at 5 blocks.

2. OP page is dense.
   - File: `LabPage.tsx`.
   - Evidence: Controls, account info, chain canvas, scoreboard, inspector, lifecycle, proof lab, and event log are all on the page.
   - Fix: Keep top focused on "Run, current batch, selected batch" and push explainers lower.

Clear strengths:

- `BlockInspector.tsx` clearly separates local verification and L1 challenge actions.
- `batchEducation.ts` correctly states that challenges require a challenger and a bond.
- `OptimisticPortalMock.sol` and `FraudProofGame.sol` are unusually good teaching stand-ins.
- `OpcodeRace.tsx` and the source-map-backed Solidity line exhibit are strong "black box opens" features.

## ZK Rollup Page Audit

Critical findings:

- None found that make the ZK mechanism fundamentally wrong. The text consistently says validity proof replaces optimistic challenge games, and rejected proofs do not finalize the state.

High findings:

1. ZK batching is not visually taught in the live canvas.
   - Files: `app/components/BlockchainCanvas.tsx`, `app/zk/page.tsx`, `LabPage.tsx`.
   - Evidence: ZK mode renders `StandardLane`, and `StandardLane` only attaches batch data/click behavior for `op-l2`.
   - Why it matters: The user sees ZK blocks, not batches. This weakens the core lesson that ZK rollups also batch L2 transactions and commit/prove batch transitions on L1.
   - Fix: Add a `ZkLane` that groups ZK blocks into submitted proof batches and shows accepted/rejected proof state.

2. The ZK page promises witness inspection but does not show witness or commitment artifacts.
   - Files: `ResearchPanel.tsx`, `ZkInspect.tsx`, `types/index.ts`, `contracts/l1/ZkRollupMock.sol`.
   - Evidence: `ResearchPanel` says users can inspect witness inputs, but `ZkInspect` shows concepts, constraints, prove time, and verify gas. It does not show header hash, claimed root, recomputed root, public inputs, proof bytes, witness state, or batch data hash.
   - Why it matters: Users cannot tell what is actually on L1 or what the verifier checks.
   - Fix: Extend the ZK payload and UI to show batch header hash, previous root, claimed post root, recomputed root, tx count, and a labeled "witness in this demo" panel.

3. Data availability and privacy caveats are missing from the ZK learning path.
   - Files: `zkEducation.ts`, `ZkInspect.tsx`, `ResearchPanel.tsx`.
   - Why it matters: A common misunderstanding is "ZK means private" or "proof alone is enough to reconstruct state." The app should explicitly say this demo is validity-focused and not a privacy or DA demo.
   - Fix: Add a "What the proof does not solve here" callout: transaction data availability and privacy are separate topics.

Medium findings:

1. Proof generation is shown as a completed metric, not as a visible phase.
   - Files: `backend/internal/sequencer/zk.go`, `app/lib/reducer.ts`, `ZkInspect.tsx`.
   - Evidence: The frontend receives `zk_inspect_ready` only after verification. There is no pending "proving" state.
   - Why it matters: ZK finality is often delayed by proof generation. The current page can imply proof verification is the only timing cost.
   - Fix: Add lifecycle states: "batch closed", "proving off-chain", "submitted to L1 verifier", "accepted/rejected."

2. Finality language is too absolute.
   - Files: `zkEducation.ts`, `Scoreboard.tsx`, `ZkInspect.tsx`.
   - Evidence: Copy says finalized immediately and no waiting period.
   - Why it matters: This is true in the app's simplified model after verifier acceptance, but production systems still have proof generation latency, L1 inclusion/finality, and bridge details.
   - Fix: Use "accepted immediately after L1 verifier success in this model" instead of "finalized immediately" everywhere.

3. ZK `txCount` is underused.
   - Files: `types/index.ts`, `ResearchPanel.tsx`, `zkEducation.ts`.
   - Evidence: Payload includes `txCount`, but proof list and tour do not emphasize the live batch size.
   - Why it matters: Batch size is central to rollup economics.
   - Fix: Show "N swaps in this proof batch" in proof cards and the claim step.

Low findings:

1. OP vs ZK contrast is clear but placed inside ZK strip/modal rather than integrated into flow.
   - Files: `ZkContrastStrip.tsx`, `ZkInspect.tsx`.
   - Fix: Keep it, but add a ZK-native pipeline above it.

Clear strengths:

- `zkEducation.ts` correctly discloses that `ZkValidityVerifier` re-executes as a stand-in, not a succinct proof.
- `ZkRollupMock.sol` and `ZkValidityVerifier.sol` comments are clear and accurate.
- Success and failure outcomes are represented in `Scoreboard`, `ResearchPanel`, and `ZkInspect`.

## Cross-Page UX / Information Architecture Audit

The pages should intentionally diverge.

OP should be organized around an adversarial timeline:

1. L2 swaps execute.
2. Sequencer posts an assertion/root with bond.
3. Challenge window opens.
4. Watcher detects mismatch off-chain.
5. User verifies locally.
6. User chooses whether to post a challenge bond.
7. FraudProofGame resolves.
8. Bonds settle and finality changes.

ZK should be organized around a proving and verification pipeline:

1. L2 swaps execute.
2. Batch closes.
3. Public inputs are formed.
4. Prover generates a proof off-chain.
5. L1 verifier checks proof/public inputs.
6. Canonical root advances or rejection occurs.
7. User sees what this model simplifies about DA, privacy, and proof succinctness.

Current IA problems:

- `LabPage.tsx` gives OP more useful mechanics than ZK. That is acceptable only if ZK receives its own specialized proof pipeline.
- The L1 lane is visually underused on both pages. L1 is where commitments, challenges, proof submissions, and finality decisions happen, but many of those events are text-only.
- The event log is useful for technical users but does not replace diagrams. It should support, not carry, the L1 story.
- E2E tests are stale against the new IA. `e2e/ui.spec.ts` still expects the old full lab at `/`.

## UI Box / Flow / Diagram Audit

Home chooser:

- `app/page.tsx` correctly separates `/op` and `/zk`.
- The cards are concise and accurate.
- The OP card could say "challenge is manual" explicitly.
- The ZK card should say "not a privacy demo" or leave that to the ZK page.

Header:

- `LabFrame.tsx` labels OP as "Output roots · local verification · user challenges · bond settlement."
- Good compact framing.
- Needs a state-root/output-root bridge on OP page.

Control panel:

- Seed and speed controls are useful.
- Current challenge-count copy can imply automation. It should say "suspicious batches available to verify/challenge."
- Session timer is useful for demos but should not overpromise exact dispute counts.

Demo gallery:

- OP cards are useful: clean, subtle fraud, obvious fraud, mixed.
- ZK cards are useful but should say "invalid proof claim" rather than "bad proof" when the model is really a bad claimed root checked by witness re-execution.

Welcome banner:

- OP steps are mostly correct.
- ZK steps are too compressed. They skip public inputs and data availability.
- OP banner should include "flagging is not a challenge."

Blockchain canvas:

- OP lane visually groups five blocks into one batch. This is strong.
- ZK lane does not visually group blocks into proof batches. This is a high-priority gap.
- L1 lane shows block height but does not mark batch posts, challenges, proofs, or finality decisions. This weakens the L1 posting lesson.
- Helper text says "click a batch to inspect" even in ZK mode, but ZK blocks are not clickable.

OP batch cards:

- `OpBatchGroup` status badges and block grouping are good.
- "FRAUD PROVEN" animation is good only after resolution.
- Hover-only explanations are insufficient for core states.

Block inspector:

- Strongest OP teaching surface.
- It shows batch block range, swaps, state root, mismatch roots, local verify, challenge button, and bond cost.
- It correctly gates challenge after local verification.
- It should more aggressively distinguish "off-chain watcher flag" from "L1 challenge transaction."

Optimistic lifecycle tracker:

- Strong table and ledger content.
- Source exhibit is excellent for proof transparency.
- Reroute diagram is currently misleading when merely flagged.
- Simplifications footer is accurate but too hidden.

Scoreboard:

- Useful high-level counters.
- OP detection/resolution label is misleading.
- ZK counters are useful but can drift across session resets due reducer behavior.

Research panel:

- OP explanation is strong.
- ZK explanation is correct but static.
- Proof cards should include tx count and commitment/root data.

ZK contrast strip:

- Good comparison rows.
- Should not be the primary ZK teaching surface.

ZK inspect modal:

- Good three-step tour.
- It discloses re-execution stand-in.
- It lacks actual public input/commitment display.
- It lacks data availability and privacy caveats.

Event log:

- Useful technical audit trail.
- Current reducer throttling can break after long runs because `blockLog` is capped at 60 and the modulo throttle can pass every block once capped.
- Event log should stay supporting material.

Opcode overlay:

- Strong detailed proof walkthrough.
- Needs mobile layout hardening and Escape/focus handling.

## Simplification Audit

| Simplification | Acceptable? | Disclosed? | Could Mislead? | Recommended Wording |
|---|---:|---:|---:|---|
| 120s OP challenge window instead of about 7 days | Yes | Yes, in `opTrackerEducation.ts` and OP copy | Low | "This demo compresses the challenge window to 120s so you can watch finality." |
| 5 L2 blocks per batch | Yes | Yes | Low | "This lab uses fixed 5-block batches. Production batch cadence varies." |
| Fixed 0.1 ETH sequencer and challenger bonds | Yes | Partly | Medium | "This app uses equal 0.1 ETH bonds for both parties. Production bond rules vary by protocol." |
| Watcher always detects mismatches | Yes for demo | Partly | Medium | "The demo watcher is honest and always flags mismatches. Real systems rely on at least one honest participant monitoring." |
| User manually verifies and challenges | Yes | Yes | Medium due cadence copy | "The app never auto-challenges. It only surfaces suspicious batches for you to verify and challenge." |
| Fraud proof reduced to swap VM one-step proof | Yes | Yes | Low | "The real idea is bisection to one instruction. This lab uses a tiny swap VM instead of production fault-proof VMs." |
| Good swaps visually re-sequenced into next batch | Acceptable as visual shorthand | Yes but buried | Medium | "Visual shorthand: valid user intents are shown as re-queued. The UI does not literally replay a future on-chain batch here." |
| ZK verifier re-executes witness instead of verifying succinct proof | Yes for teaching | Yes | Medium | "This verifier is a stand-in. Production ZK verification checks a succinct proof without re-executing every swap." |
| ZK finality immediately after verifier success | Acceptable for mock | Partly | Medium | "In this simplified model, L1 accepts the root immediately after verifier success. Real systems still have proof generation, L1 inclusion/finality, and bridge considerations." |
| ZK proof generation time simulated | Yes | Yes | Low | "Constraints and prove time are simulated metrics to make prover cost visible." |
| Data availability not modeled | Acceptable only if disclosed | No | High | "This demo focuses on validity. It does not model calldata/blob data availability or how users reconstruct state." |
| ZK privacy not modeled | Acceptable only if disclosed | No | High | "ZK here means validity proof, not private transactions. This demo does not implement privacy-preserving rollup variants." |
| Fault rates tuned for demo | Yes | Partly | Low | "Fault frequency is artificially high for recording. Production fraud/invalid proof rates should be rare." |

## Prioritized Fix List

| Priority | Severity | Page | File/Component | Problem | Recommended Fix | Why It Matters |
|---:|---|---|---|---|---|---|
| 1 | High | OP | `OptimisticTracker.tsx` | Flagged batches are shown as rejected/rolled back before L1 challenge resolution. | Split diagram states. For `flagged && !challenged`, show "Watcher flagged off-chain, no L1 outcome yet." Only show rollback/slash/reject for `resolved`. | Preserves the central OP idea that challenges are not automatic. |
| 2 | High | ZK | `BlockchainCanvas.tsx` | ZK page does not visually batch blocks or make batches inspectable. | Add `ZkLane` grouped proof batch cards with accepted/rejected/pending proof states and click-to-open `ZkInspect`. | Teaches that ZK rollups also batch L2 transactions and settle batch commitments on L1. |
| 3 | High | ZK | `ZkInspect.tsx`, `types/index.ts`, backend ZK event payload | ZK page does not show actual L1 commitments/public inputs. | Include header hash, previous root, claimed root, recomputed root, batch data hash, tx count, and witness summary in payload and UI. | Shows what data/proofs/commitments are actually on L1. |
| 4 | High | ZK | `zkEducation.ts`, `ZkInspect.tsx`, `ResearchPanel.tsx` | No privacy or data availability caveat. | Add visible "Validity, not privacy or DA" callout. | Prevents common ZK rollup misconceptions. |
| 5 | High | OP | `ControlPanel.tsx`, `WelcomeBanner.tsx`, `DemoGallery.tsx` | Challenge cadence copy implies automatic challenges. | Replace "catches challenges" with "surfaces suspicious batches for you to verify and challenge." | Reinforces actor-triggered challenges. |
| 6 | Medium | OP | `Scoreboard.tsx` | Watcher detection and challenge resolution are blurred. | Rename current metric to "fraud resolved" or add separate "watcher flagged" metric. | Separates detection from dispute resolution. |
| 7 | Medium | OP | `OptimisticTracker.tsx`, `opLedger.ts` | Challenger returned/lost bond summary is incomplete. | Show challenger posted, returned, won, lost/slashed. | Teaches correct and incorrect challenge economics. |
| 8 | Medium | Both | `BlockchainCanvas.tsx` | L1 lane does not show commitment/proof/challenge events. | Add L1 event markers for batch posted, challenge submitted, proof submitted, root finalized/rejected. | Makes L1 posting concrete instead of text-only. |
| 9 | Medium | ZK | `app/lib/reducer.ts` | ZK scoreboard can drift across stops/hydration. | Clear or recompute ZK scoreboard from `zkRollups`/snapshot on stop and hydrate. | Prevents false educational counters. |
| 10 | Medium | Both | `e2e/ui.spec.ts` | E2E tests expect old `/` full lab instead of chooser. | Update tests for `/`, `/op`, `/zk`. | Keeps UI regressions catchable. |
| 11 | Medium | Both | `app/lib/*`, `AGENTS.md` | Repo instructions say not to place source under `app/lib`, but source is there. | Move to `app/core` or update `AGENTS.md` if obsolete. | Reduces contributor confusion. |
| 12 | Medium | Both | `protocol.ts`, backend constants, comments | Constants and comments are manually mirrored. Some backend comments still mention old fault rates. | Generate shared protocol constants or add `/api/protocol`; update stale comments. | Avoids copy/protocol drift. |
| 13 | Low | ZK | `ZkInspect.tsx`, reducer/backend events | No visible proving pending phase. | Add `proving` event/state before verifier result. | Teaches proof generation latency. |
| 14 | Low | OP | `OptimisticTracker.tsx` | Simplifications hidden in collapsed footer. | Add visible compact simplification strip near top. | Prevents overgeneralization. |
| 15 | Low | Both | `OpcodeRace.tsx`, `ZkInspect.tsx` | Modal accessibility/mobile handling is limited. | Add Escape close, focus management, and mobile stacking. | Improves usability without changing concepts. |

## Suggested Revised Learning Flows

Optimistic Rollup page:

1. Start with a five-step horizontal mechanism strip:
   - L2 executes swaps.
   - Sequencer posts batch root to L1 with bond.
   - Challenge window opens.
   - Watcher may flag off-chain.
   - User verifies and may challenge.
2. Show live L2 batch buffer:
   - Current L2 blocks collected.
   - Swap count.
   - "Next L1 post at 5 blocks."
3. On batch post, show L1 card:
   - Batch id.
   - Batch data hash.
   - Posted state/output root.
   - Sequencer bond.
4. If watcher flags:
   - Yellow state: "Suspicious, not challenged."
   - CTA: "Verify locally."
5. After verification:
   - If mismatch: show "Challenge on L1, 0.1 ETH bond at risk."
   - If valid: show "Challenge would likely lose bond."
6. After challenge:
   - Orange state: dispute live.
   - Show bisection progress.
7. After resolution:
   - Red rejected or green upheld.
   - Show bond settlement.
   - Show source line/opcode proof.
8. Keep simplifications visible:
   - "120s window, tiny VM, fixed bonds, visual re-sequencing."

ZK Rollup page:

1. Start with a ZK-native pipeline:
   - L2 swaps.
   - Batch closes.
   - Public inputs formed.
   - Proof generated off-chain.
   - L1 verifier accepts/rejects.
2. Show ZK batch cards in the canvas:
   - Batch id, L2 block range, swap count.
   - Proving, submitted, verified, rejected states.
3. On selecting a ZK batch, show:
   - Header hash.
   - Previous root.
   - Claimed post root.
   - Recomputed root or verifier result.
   - Tx count and batch data commitment.
4. Show proof economics:
   - Simulated constraints/prove time.
   - Real measured verifier gas.
   - Explain proof generation latency separately from verifier time.
5. Show outcome:
   - Accepted: canonical root advances in this model.
   - Rejected: root unchanged, no challenge game.
6. Show caveats:
   - "Validity proof, not privacy."
   - "Data availability not modeled."
   - "Verifier re-executes in this demo; production verifies succinct proofs."

## Copy Recommendations

Replace OP timer copy:

Current:

> 60s usually catches 1-2 OP disputes; 120s usually catches 3-4.

Recommended:

> At 4x, a 60s run usually surfaces 1-2 suspicious OP batches for you to verify and challenge. The app never auto-challenges.

Replace OP suspicious diagram copy:

Recommended flagged state:

> Watcher flagged this root off-chain. Nothing has been rejected on L1 yet. A participant must verify locally and submit a challenge before the window closes.

Recommended challenged state:

> Challenge submitted on L1. Both bonds are locked while FraudProofGame narrows the trace.

Recommended resolved state:

> Fraud proven on L1. The bad root is rejected, dependent withdrawals are blocked, and bonds settle.

Replace OP scoreboard metric:

Current:

> OP fraud detection

Recommended:

> OP fraud resolved

Add OP glossary callout:

> In this lab, "output root", "state root", and "assertion" all refer to the sequencer's posted commitment to the L2 state after a batch. Production rollups may wrap more data into an output root.

Replace ZK finality copy:

Current:

> L1 finalized this batch immediately, no challenge window.

Recommended:

> In this simplified model, L1 accepts the new root as soon as the verifier succeeds. Production systems still have proof-generation time, L1 inclusion/finality, and bridge details.

Add ZK caveat callout:

> This is a validity-proof demo, not a privacy demo. The proof shows the state transition is valid. It does not by itself explain data availability, calldata/blobs, or privacy-preserving transaction designs.

Add ZK public input panel copy:

> Public inputs bind the proof to visible commitments: previous root, claimed post root, batch data hash, and batch id. If any commitment changes, the proof no longer verifies.

Replace ZK proof card:

Recommended:

> Batch #12 · 5 L2 blocks · 7 swaps · verifier accepted

or

> Batch #12 · 5 L2 blocks · 7 swaps · verifier rejected

## Implementation Plan

Stage 1: Fix misleading OP states.

- Update `RerouteDiagram` in `OptimisticTracker.tsx` so `flagged` does not imply rejection.
- Update timer/demo copy to say "suspicious batches available to verify/challenge."
- Rename or split the OP scoreboard detection metric.
- Add challenger returned/lost bond summary.
- Run `make build` and `make test`.

Stage 2: Make ZK batching visible.

- Add a `ZkLane` or mode-specific ZK batch grouping in `BlockchainCanvas.tsx`.
- Extend ZK frontend state to associate `zkRollups` with L2 block ranges and click behavior.
- Open `ZkInspect` from ZK batch cards.
- Include tx count on ZK proof cards.
- Run `pnpm build` and route smoke checks.

Stage 3: Surface ZK commitments.

- Extend backend `ZkInspectReadyPayload` to include header hash, previous root, claimed root, recomputed root, batch data hash, and maybe witness account count.
- Extend `types/index.ts`.
- Add a "Public inputs and verifier result" panel to `ZkInspect.tsx`.
- Update tests for ZK accepted/rejected payloads.
- Run `make test`.

Stage 4: Add caveats and simplification visibility.

- Add visible OP and ZK simplification callouts near the top of each page.
- Add ZK data availability/privacy caveat.
- Fix stale backend comments about old 1-in-30 and 1-in-60 fault rates.
- Consider a generated protocol constants artifact or `/api/protocol`.

Stage 5: Repair tests and visual verification.

- Update `e2e/ui.spec.ts` for `/`, `/op`, and `/zk`.
- Install Playwright Chromium in CI/local dev.
- Add screenshot coverage for OP flagged, challenged, resolved, and ZK accepted/rejected states.
- Add modal accessibility improvements.

## Final Verdict

Current app status (post Phase 7 education-audit fixes):

- Conceptually sound: Yes, especially in backend contracts and OP proof mechanics.
- Partially misleading: Reduced. OP flagged state is now distinct from L1 rejection; challenge copy states manual verify/challenge. ZK batching and commitments are visible on `/zk`.
- Visually confusing: Improved for ZK; OP remains dense but legible with Optimistic Tracker + simplification strip.
- Ready for users: Acceptable for a guided technical demo; self-guided learners should still read simplification callouts.
- Remaining gaps (low priority): L1 lane event markers, visible ZK "proving" pending phase, modal a11y hardening — see prioritized fix list above.

The project is close to a strong technical teaching product. The main work is not adding more blockchain detail. It is making the existing state machine impossible to misread.
