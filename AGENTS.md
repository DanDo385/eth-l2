# AGENTS.md

Canonical agent instructions for this repository.

Do not add separate root-level `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, or tool-specific instruction files unless a tool absolutely requires a shim. If a shim is required, it must only point back to this file and must not contain independent rules.

## Project purpose

`eth-l2` is a rollup mechanics lab. It visualizes optimistic and ZK rollup security: L2 trades become batches, a sequencer posts a claimed state root, a challenger disputes a bad batch, **FraudProofGame** bisects Merkle-committed traces and re-executes one step on L1, and the frontend walks the proof from first principles.

Portfolio lane: `deep-weeds`.

## Demo principle

This should feel like a technical walkthrough that opens the black box.
The viewer should leave understanding how optimistic trust turns back into verification.

The emotional hook is: catch the lying sequencer.
The technical hook is: bad batch → watcher flags (off-chain) → user verifies → challenge bond → FraudProofGame → opcode/storage mismatch + source line → bond settlement.

## Documentation

Keep these in sync when behaviour changes:

| File | Role |
|------|------|
| [README.md](README.md) | Setup, architecture, protocol constants, tests |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Suggested live demo flow |
| [PLAN.md](PLAN.md) | Historical implementation plan + work-order archive |
| [docs/rollup-education-audit.md](docs/rollup-education-audit.md) | UX/education audit (findings + fix checklist) |

## Engineering principles

- Keep the app deterministic enough for repeatable demo sessions (same seed ⇒ same behaviour).
- Prefer focused protocol mechanics over pretending this is a full production rollup.
- Make state transitions, bonds, and disputes visually inspectable.
- README and `DEMO_GUIDE.md` must match current behaviour.

## Frontend rules

- Demo-facing surfaces: `WelcomeBanner`, `BlockchainCanvas`, `OpBatchGroup`, `ZkBatchGroup`, `BlockInspector`, `OptimisticTracker`, `OpcodeRace`, `ResearchPanel` (Proof lab), `ZkInspect`, `DemoGallery`, `Scoreboard`, `EventLogPanel`.
- Keep protocol vocabulary accurate; define mechanisms when introduced (`app/data/batchEducation.ts`, `opTrackerEducation.ts`, `traceNarrative.ts`, `zkEducation.ts`).
- Overlays (opcode proof, ZK inspect) open from Proof lab, Block Inspector, or ZK batch cards — never auto-popup.
- Do not place source files under `app/lib/`; this repo's ignore rules can hide `lib/` paths.

## Contract / artifact rules

- Mock contracts stay mechanism-focused (`FraudProofGame`, `ZkValidityVerifier` are teaching stand-ins, not production provers).
- `broadcast/` is gitignored — deployments are reproduced at `make dev` / backend start.
- Generated artifacts should be reproducible from repo commands (`forge build`, `make build`).
- Do not commit accidental package manager lockfiles that conflict with the repo's package manager convention.

## Verification

Before reporting success after code changes:

```bash
make build
# or: npm run build && forge test && cd backend && go test ./...
```

E2E (optional): `pnpm exec playwright install chromium` then `make test-e2e`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
