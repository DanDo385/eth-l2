# Demo Guide — Rollup Mechanics Lab

A guide for recording the portfolio walkthrough. Target length: 2–3 minutes.

## What to show

The core story: **a lying sequencer posts a bad batch → the auto-challenger catches it → bisection narrows the trace → one SSTORE opcode exposes the fraud**.

## Before recording

```bash
make install        # one-time
make dev            # starts Go backend + Next.js on port 3001
```

Open [http://localhost:3001](http://localhost:3001) in a clean browser window (no extensions, dark mode on).

## Recommended sequence

### 0:00–0:20 — Introduce the lab

Point at the header, the three-lane canvas (L1 / OP L2 / ZK L2), and the Demo Gallery.

> "This is a rollup mechanics lab. Three local blockchains, real Solidity contracts, bots trading, and a Go backend that automatically challenges fraudulent batches."

### 0:20–0:45 — Start a seeded run

Click the **Obvious fraud** card (seed 17) or type seed 42 in the control panel and click **Start**.

Show blocks appearing in the canvas lanes. Point at the OP L2 lane as batches turn blue (posted).

> "Trades hit the swap engine on L2. The sequencer bundles them into a batch every five blocks and posts a state root back to L1."

### 0:45–1:15 — Fraud is detected

When a batch turns yellow/orange (flagged → challenged), click it to open the **Block Inspector**.

> "The honest watcher computes what the state root should be. When the sequencer's posted root disagrees, the challenger automatically opens a dispute on L1 and starts bisection."

Show the EngineType badge and the challenge button in the inspector.

### 1:15–1:50 — Opcode Race replay

Once a batch turns red (resolved), click the **Opcode Race** button.

Watch both tapes (Honest / Claimed) scroll step by step through the EVM trace, then hard-stop at the diverging instruction.

> "Bisection narrows a 100+ step trace to a single disagreement. Here: one SSTORE writes the wrong output amount. That's where trust turns back into verification."

Point at the red divider, the op/slot/value callout, and the Replay button.

### 1:50–2:20 — Scoreboard and ZK comparison

Scroll to the Scoreboard. Point at detection rate %, honest/fraudulent/challenged/resolved counts.

Mention the ZK lane: no fraud window, proof verified on every batch.

> "Compare this to the ZK lane — every batch carries a validity proof, so the chain never needs to wait for a challenge window."

### 2:20–2:40 — Architecture close

> "The backend is pure Go: bots, sequencer, honest watcher, auto-challenger, and a WebSocket server. The frontend is Next.js with a real-time reducer. No mock data — every event comes from a live anvil chain."

## Seeds cheat sheet

| Seed | What happens |
|------|-------------|
| 42 | Subtle fraud: fee rounding SSTORE divergence |
| 88 | Honest run: all batches finalize cleanly |
| 17 | Obvious fraud: wrong output amount, fast divergence |
| 99 | Mixed: both fraud types appear within one run |

## Tips

- Use seed **17** for the fastest fraud catch (diverges early in the bisection).
- Use seed **42** for a subtler story (fee rounding is harder to spot visually).
- Speed slider at **4×** gives fast-enough block cadence without filling the canvas instantly.
- The **Replay** button in OpcodeRace resets the tape animation — useful for a clean second take.

## One-liner

> "A rollup mechanics lab that shows trades becoming batches, a lying sequencer getting caught through bisection, and the exact opcode where trust turns into verification."
