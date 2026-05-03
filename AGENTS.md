# AGENTS.md

Canonical agent instructions for this repository.

Do not add separate root-level `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, or tool-specific instruction files unless a tool absolutely requires a shim. If a shim is required, it must only point back to this file and must not contain independent rules.

## Project purpose

`eth-l2` is a rollup mechanics lab. It visualizes optimistic rollup security: L2 trades become batches, a sequencer posts a claimed state root, a challenger disputes a bad batch, bisection narrows the disagreement, and a fraud-proof step exposes the invalid state transition.

Portfolio lane: `deep-weeds`.

## Demo principle

This should feel like a technical walkthrough that opens the black box.
The viewer should leave understanding how optimistic trust turns back into verification.

The emotional hook is: catch the lying sequencer.
The technical hook is: bad batch -> bisection -> opcode/state mismatch -> invalid result.

## Engineering principles

- Keep the app deterministic enough for repeatable Loom recordings.
- Prefer focused protocol mechanics over pretending this is a full production rollup.
- Make state transitions and disputes visually inspectable.
- README and `DEMO_GUIDE.md` must match current behavior.

## Frontend rules

- Preserve `DeepWeedsDemoDirector` and `FraudProofWar` as demo-facing surfaces.
- Keep protocol vocabulary accurate, but define mechanisms when introduced.
- Use deterministic fallback data from `app/data/demoData.ts` for recordable demos.
- Do not place source files under `app/lib/`; this repo's ignore rules can hide `lib/` paths.

## Contract/artifact rules

- Keep mock contracts clear and mechanism-focused.
- Generated artifacts should be reproducible from repo commands.
- Do not commit accidental package manager lockfiles that conflict with the repo's package manager convention.

## Verification

Before reporting success after code changes:

```bash
cd /Users/openclaw/eth-l2
npm run build
```
