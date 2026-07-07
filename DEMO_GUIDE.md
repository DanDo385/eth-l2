# Demo Guide — Rollup Mechanics Lab

Recording script for a **~2–3 minute** portfolio walkthrough.

**Setup and protocol details:** [README.md](README.md)

## What to show

**Lying sequencer → watcher flags (off-chain) → user verifies → challenge bond → FraudProofGame → bond settlement → (contrast) ZK validity at the gate.**

## Before recording

```bash
make install
make dev
```

Open [http://localhost:3001/op](http://localhost:3001/op) — clean window, dark mode. The home page at `/` is a chooser for the optimistic and ZK labs.

## Recommended sequence

### 0:00–0:20 — Introduce the lab

Header, **How this lab works** banner, L1 + OP L2 canvas (grouped batch cards), Demo Gallery.

> "Rollup mechanics lab — three Anvil chains, real Solidity, and a user-driven optimistic challenge flow. A watcher flag is detection, not rejection."

### 0:20–0:45 — Start a fraud run

Click **Obvious fraud** (seed 17) or seed **42** + **Start simulation**.

OP lane: blocks collect into batches of five, then turn blue when posted.

> "Swaps on L2; every five blocks the sequencer posts one state root to L1 with a bond."

### 0:45–1:15 — Flagged, then verified, then challenged

Yellow batch: open **Block Inspector**. Show engine badge and **Verify locally**.

> "Honest watcher replayed the batch off-chain — wrong root. Nothing is rejected on L1 until I verify and post a challenge bond."

After verify → **Challenge on L1**. Point at **Optimistic Tracker** reroute diagram: flagged state shows no rollback yet; dispute state locks bonds.

### 1:15–1:50 — Fraud proof walkthrough

Red resolved batch → **Walk opcode proof step-by-step** (or **Proof lab**).

Intro chapter → step through honest vs claimed storage → verdict with **Solidity source line** + bond payout note.

> "Merkle bisection to one VM step; the contract re-executes it on L1. Trust becomes verification."

### 1:50–2:10 — Challenge window & bonds

Seed **88** (Clean run) or a blue batch still counting down. Show bond ledger in Optimistic Tracker / Account sidebar.

> "Honest batches wait 120 seconds here — mainnet uses ~7 days. Suspicious roots are not auto-challenged. The user verifies locally, posts a challenge bond only if a mismatch is found, and then L1 settles the bonds."

Point at countdown and bond-settlement copy in Block Inspector.

### 2:10–2:30 — ZK contrast

Switch to [http://localhost:3001/zk](http://localhost:3001/zk). Show grouped ZK proof batches on the canvas, the **Claim → Prove → Verify** pipeline strip, and click a batch to open the **ZK concept tour**.

In the tour, expand **Public inputs and L1 commitments** (header hash, roots, batch data hash).

> "ZK lane: validity checked at submission — no challenge window. This demo is validity-focused, not privacy or data availability."

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

- Seed **17** at **4×** speed for a tight fraud arc; **60s session timer** keeps recordings short.
- At 4×, a 60s run usually surfaces **1–2 suspicious OP batches** to verify and challenge (not auto-challenged).
- Proof overlays never auto-open — click from Inspector, canvas batch cards, or Proof lab for a clean take.
- See [README.md](README.md) for `make test-e2e` and screenshot regeneration.

## One-liner

> "Catch the lying sequencer: watcher flags off-chain, you verify and challenge on L1, FraudProofGame proves the exact Solidity line, bonds settle — then contrast with ZK validity at the gate."
