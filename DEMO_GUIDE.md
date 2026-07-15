# Demo Guide - Rollup Mechanics Lab

Suggested **live demo flow** for walking someone through the lab interactively.

**Setup and protocol details:** [README.md](README.md)

## Narrative arc

**Lying sequencer → watcher flags (off-chain) → user verifies → challenge bond → FraudProofGame → bond settlement → (contrast) ZK validity at the gate.**

## Getting started

```bash
make install
make dev
```

`make dev` starts **both** the Go backend (`:8080`) and Next.js (`:3001`). Running only `pnpm dev` leaves the UI disconnected.

Open [http://localhost:3001/op](http://localhost:3001/op). The home page at `/` is a chooser for the optimistic and ZK labs.

Use a clean browser window (dark mode matches the UI). Hide unrelated desktop clutter before you record.

## Capturing video (macOS)

Record with the built-in **Screenshot** app - not a separate capture service.

1. Press **⌘⇧5** (or open **Screenshot** from Spotlight).
2. Choose **Record Selected Portion** or **Record Entire Screen**.
3. Click **Options** → enable the microphone if you want narration; pick a save location (Desktop is fine).
4. Click **Record**, run the demo sequence below, then stop from the menu bar icon.

Tips for a clean take:

- Resize the browser so the lab fills the frame; `/op` and `/zk` are separate routes - switch tabs or windows between OP and ZK beats.
- Use the **60s session timer** in the control panel to auto-stop between takes (tears down Anvil; Start again for the next take).
- Proof overlays never auto-open - click when you are ready so the recording stays deliberate.

Playwright still captures static PNGs under `public/screenshots/` via `make test-e2e`; that is for layout regression, not portfolio video.

## Portfolio media (checked into `public/`)

| Asset | Path | Notes |
|-------|------|-------|
| Screenshots | `public/screenshots/*.png` | Source frames for the rotating GIF |
| Preview GIF | `public/gif/preview.gif` | 1280x720 letterboxed slideshow from screenshots |
| Short clip | `public/short-clip/short.mov` | ~31s local recording |
| Long clip | `public/long-clip/long.mov` | ~74s local recording |
| Short YouTube | https://www.youtube.com/watch?v=3Rrlpz-vEFE | Unlisted short walkthrough |
| Full YouTube | https://www.youtube.com/watch?v=SEpEn8fTjmk | Unlisted full walkthrough |

Machine-readable copy of the YouTube IDs lives in [`public/media.json`](public/media.json). Portfolio site fields: `shortClipUrl` / `youtubeUrl` → short, `recordingUrl` → full.

## Suggested sequence

### 1 - Introduce the lab

Header, **How this lab works** banner, L1 + OP L2 canvas (grouped batch cards), Demo Gallery.

> "Rollup mechanics lab - three Anvil chains, real Solidity, and a user-driven optimistic challenge flow. A watcher flag is detection, not rejection."

### 2 - Start a fraud run

Click **Obvious fraud** (seed 17) or seed **42** + **Start simulation**.

OP lane: blocks collect into batches of five, then turn blue when posted.

> "Swaps on L2; every five blocks the sequencer posts one state root to L1 with a bond."

### 3 - Flagged, then verified, then challenged

Yellow batch: open **Block Inspector**. Show engine badge and **Verify locally**.

> "Honest watcher replayed the batch off-chain - wrong root. Nothing is rejected on L1 until I verify and post a challenge bond."

After verify → **Challenge on L1**. Point at **Optimistic Tracker** reroute diagram: flagged state shows no rollback yet; dispute state locks bonds.

### 4 - Fraud proof tour

Red resolved batch → **Walk opcode proof step-by-step** (or **Proof lab**).

Intro chapter → step through honest vs claimed storage → verdict with **Solidity source line** + bond payout note.

> "Merkle bisection to one VM step; the contract re-executes it on L1. Trust becomes verification."

### 5 - Challenge window & bonds

Seed **88** (Mostly honest) or a blue batch still counting down. Show bond ledger in Optimistic Tracker / Account sidebar.

> "Honest batches wait 120 seconds here - mainnet uses ~7 days. Suspicious roots are not auto-challenged. The user verifies locally, posts a challenge bond only if a mismatch is found, and then L1 settles the bonds."

Point at countdown and bond-settlement copy in Block Inspector.

### 6 - ZK contrast

Switch to [http://localhost:3001/zk](http://localhost:3001/zk). Show grouped ZK proof batches on the canvas, the **Claim → Prove → Verify** pipeline strip, and click a batch to open the **ZK concept tour**.

In the tour, expand **Public inputs and L1 commitments** (header hash, roots, batch data hash).

> "ZK lane: validity checked at submission - no challenge window. This demo is validity-focused, not privacy or data availability."

### 7 - Wrap up

> "Go backend, WebSocket events, Next.js reducer - everything from live chains, not mock UI data."

## Seeds

| Seed | Card | Use |
|------|------|-----|
| 17 | Obvious fraud | Fastest fraud arc |
| 42 | Subtle fraud | Fee-rounding story |
| 88 | Mostly honest | Challenge window + bond return |
| 99 | Mixed | Both fraud types over time |

## Tips

- Seed **17** at **4×** speed for a tight fraud arc; the **60s session timer** auto-stops so Anvil is not left mining on the Ubuntu backend.
- At 4×, a 60s run usually surfaces **1-2 suspicious OP batches** to verify and challenge (not auto-challenged).
- Proof overlays never auto-open - click from Inspector, canvas batch cards, or Proof lab when you are ready.
- See [README.md](README.md) for `make test-e2e`.

## One-liner

> "Catch the lying sequencer: watcher flags off-chain, you verify and challenge on L1, FraudProofGame proves the exact Solidity line, bonds settle - then contrast with ZK validity at the gate."
