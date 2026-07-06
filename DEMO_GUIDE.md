# Demo Guide — Rollup Mechanics Lab

Recording script for a **~2–3 minute** portfolio walkthrough.

**Setup and protocol details:** [README.md](README.md)

## What to show

**Lying sequencer → watcher flags → FraudProofGame → bond settlement → (contrast) ZK instant validity.**

## Before recording

```bash
make install
make dev
```

Open [http://localhost:3001](http://localhost:3001) — clean window, dark mode.

## Recommended sequence

### 0:00–0:20 — Introduce the lab

Header, **How this lab works** banner, three-lane canvas (L1 / OP L2 / ZK L2), Demo Gallery.

> "Rollup mechanics lab — three Anvil chains, real Solidity, Go backend that auto-challenges fraud."

### 0:20–0:45 — Start a fraud run

Click **Obvious fraud** (seed 17) or seed **42** + **Start simulation**.

OP lane: blocks appear, batches turn blue when posted.

> "Swaps on L2; every five blocks the sequencer posts one state root to L1 with a bond."

### 0:45–1:15 — Fraud detected

Yellow → orange batch: open **Block Inspector**. Show engine badge.

> "Honest watcher replayed the batch — wrong root. Challenger posts a bond; FraudProofGame opens."

### 1:15–1:50 — Fraud proof walkthrough

Red batch → **Walk opcode proof step-by-step** (or **Proof lab**).

Intro chapter → step through honest vs claimed storage → verdict with **Solidity source line** + bond payout note.

> "Merkle bisection to one VM step; the contract re-executes it on L1. Trust becomes verification."

### 1:50–2:10 — Challenge window & bonds

Seed **88** (Clean run) or a blue batch still counting down.

> "Honest batches wait 120 seconds here — mainnet uses ~7 days. No dispute → bond back. Fraud proven → challenger takes both bonds, 10% burned."

Point at countdown and bond-settlement copy in Block Inspector.

### 2:10–2:30 — ZK contrast

Scoreboard + ZK lane. Open a ZK proof from Proof lab if one exists.

> "ZK lane: validity checked at submission — no challenge window, no watcher race."

### 2:30–2:45 — Close

> "Go backend, WebSocket events, Next.js reducer — everything from live chains, not mock UI data."

## Seeds

| Seed | Card | Use |
|------|------|-----|
| 17 | Obvious fraud | Fastest fraud catch for recording |
| 42 | Subtle fraud | Fee-rounding story |
| 88 | Clean run | Challenge window + bond return |
| 99 | Mixed | Both fraud types over time |

## Tips

- Seed **17** at **4×** speed for a tight fraud arc.
- Proof overlays never auto-open — click from Inspector or Proof lab for a clean take.
- See [README.md](README.md) for `make test-e2e` and screenshot regeneration.

## One-liner

> "Catch the lying sequencer: batches, bonds, FraudProofGame on L1, and the exact Solidity line where the math diverged."
