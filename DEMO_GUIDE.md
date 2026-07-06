# Demo Guide — Rollup Mechanics Lab

A guide for recording the portfolio walkthrough. Target length: 2–3 minutes.

## What to show

The core story: **a lying sequencer posts a bad batch → FraudProofGame catches it → bonds settle → honest batches finalize after the challenge window**.

## Before recording

```bash
make install        # one-time
make dev            # starts Go backend + Next.js on port 3001
```

Open [http://localhost:3001](http://localhost:3001) in a clean browser window (no extensions, dark mode on).

## Recommended sequence

### 0:00–0:20 — Introduce the lab

Point at the header, the **How this lab works** welcome banner, the three-lane canvas (L1 / OP L2 / ZK L2), and the Demo Gallery.

> "This is a rollup mechanics lab. Three local blockchains, real Solidity contracts, bots trading, and a Go backend that automatically challenges fraudulent batches."

### 0:20–0:45 — Start a seeded run

Click the **Obvious fraud** card (seed 17) or type seed 42 in the control panel and click **Start**.

Show blocks appearing in the canvas lanes. Point at the OP L2 lane as batches turn blue (posted).

> "Trades hit the swap engine on L2. The sequencer bundles them into a batch every five blocks and posts a state root back to L1."

### 0:45–1:15 — Fraud is detected

When a batch turns yellow/orange (flagged → challenged), click it to open the **Block Inspector**.

> "The honest watcher computes what the state root should be. When the sequencer's posted root disagrees, the challenger automatically opens a dispute on L1 and starts bisection."

Show the EngineType badge and the challenge button in the inspector.

### 1:15–1:50 — Fraud proof walkthrough

Once a batch turns red (resolved), click **Walk opcode proof step-by-step** in the Block Inspector, or open the same proof from **Proof lab** below the canvas.

The overlay opens with an intro chapter (what the swap engine did, how many EVM steps were filtered), then lets you step through honest vs claimed storage writes with human-readable narration. At the verdict, it cites the **exact Solidity line** from the deployed source map and notes the **bond payout** (challenger takes both stakes minus a 10% burn).

> "FraudProofGame bisects Merkle-committed execution traces down to one VM step, then re-executes that step on L1. That's where trust turns back into verification."

Point at the red divider, the source-line callout, and the step timeline.

### 1:50–2:10 — Challenge window and bonds (seed 88)

Switch to **Clean run** (seed 88) or point at a blue batch still in its challenge window.

> "Honest batches sit in a 120-second challenge window in this sim — production rollups use ~7 days. If nobody disputes, the sequencer gets its 0.1 ETH bond back. If fraud is proven, the challenger takes both bonds and 10% of the loser's stake is burned so griefing doesn't pay."

Show the countdown in Block Inspector and the bond-settlement note when a batch finalizes.

### 2:10–2:30 — Scoreboard and ZK comparison

Scroll to the Scoreboard. Point at detection rate %, honest/fraudulent/challenged/resolved counts.

Mention the ZK lane: no fraud window, proof verified on every batch.

> "Compare this to the ZK lane — every batch carries a validity proof, so the chain never needs to wait for a challenge window."

### 2:20–2:40 — Architecture close

> "The backend is pure Go: bots, sequencer, honest watcher, auto-challenger, and a WebSocket server. The frontend is Next.js with a real-time reducer. No mock data — every event comes from a live anvil chain."

## Seeds cheat sheet

| Seed | What happens |
|------|-------------|
| 42 | Subtle fraud: fee rounding SSTORE divergence |
| 88 | Clean run: honest batches finalize after the 120s challenge window |
| 17 | Obvious fraud: wrong output amount, fast divergence |
| 99 | Mixed: both fraud types appear within one run |

## Tips

- Use seed **17** for the fastest fraud catch (diverges early in the bisection).
- Use seed **42** for a subtler story (fee rounding is harder to spot visually).
- Speed slider at **3×** (default) gives fast-enough block cadence without filling the canvas instantly; bump to **4×** for quicker runs.
- Proof overlays never auto-popup — open them from Block Inspector or **Proof lab** when you want a clean take.

## One-liner

> "A rollup mechanics lab: batches, bonds, a 120s challenge window, FraudProofGame on L1, and the exact line of Solidity where the sequencer lied."
