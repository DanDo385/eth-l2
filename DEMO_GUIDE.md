# Loom Demo Guide: eth-l2

Status: optimized for a natural 150-180 second DeepWeeds walkthrough.
Portfolio tag: deep-weeds
Primary repo URL: https://github.com/dando385/eth-l2

## Core story

Problem:
Optimistic rollups are often described as "fast unless someone challenges," but that hides the hard part: how a system can accept an L2 result optimistically while still giving challengers a path to prove fraud on L1.

Solution:
This project visualizes the mechanics: L2 trades become batches, a bad optimistic batch gets challenged, bisection narrows the disagreement, and a fraud-proof flow identifies the exact invalid execution step.

One-liner:
A rollup mechanics lab that shows trades becoming batches, a bad optimistic batch getting challenged, and a bisection/fraud-proof flow finding the exact invalid state transition.

Positioning:
This is the `deep-weeds` lane. Use real protocol language, but define each mechanism the first time you say it.

## What the Loom should feel like

Technical, but controlled.
Do not rush. This demo should feel like you are opening the black box on rollup security.

The main emotional hook is: "catch the lying sequencer."
The technical hook is: "trust turns back into verification at the opcode/state transition boundary."

## What to run before recording

1. Generate or refresh artifacts if desired:

   cd /Users/openclaw/eth-l2
   make start deploy op analyze artifacts

2. Start the frontend:

   cd /Users/openclaw/eth-l2
   npm run dev

3. Open the app in a clean browser window.
4. Keep DeepWeeds Demo Director visible for the opening.
5. Click Simulate Trade once or twice.
6. Scroll to L2 Optimistic and Fraud Proof War.
7. End on the mismatched SSTORE card and the resolved invalid state.

The frontend has deterministic fallback data in app/data/demoData.ts, so the demo remains recordable even if generated artifacts are missing or stale.

## Step-by-step 180-second Loom

### 0:00-0:20 -- Hook: what problem this solves

Show the top of the app.
Say:
"This is a rollup mechanics lab. I built it to make the optimistic rollup security model visible: fast execution on L2, fraud accountability on L1."

Point at:
- L1 / L2 labels.
- Demo Director.
- Any trade or batch counters.

### 0:20-0:45 -- Happy path: trades become batches

Click Simulate Trade once or twice.
Say:
"Start with the happy path. Users trade on L2, the sequencer orders those transactions, and the system compresses them into a batch. That batch eventually posts a claimed state root back to L1."

Point at:
- Simulated trade.
- Batch compaction.
- Claimed state root.

### 0:45-1:10 -- The optimistic assumption

Show optimistic L2 / challenge area.
Say:
"The optimistic part is the security assumption. The system initially accepts the result, but it gives challengers a window to prove the sequencer lied. That is how the system gets speed without giving up accountability."

Point at:
- Challenge window.
- Claimed vs honest root.
- L1 settlement lane.

### 1:10-1:40 -- Bad batch appears

Move to ChallengeFlow.
Say:
"Here the posted state root differs from the honest state root. The challenger does not need to re-litigate the entire batch in one giant proof. The dispute narrows the disagreement through bisection rounds."

Point at:
- Bad batch.
- Bisection rounds.
- Mismatch root/hash.

### 1:40-2:20 -- Fraud Proof War

Show Fraud Proof War.
Say:
"I visualize the dispute like a card game. The sequencer and challenger reveal smaller pieces of the execution trace until there is only one step left. At that point, the protocol can check a single instruction/state transition. In this demo, the SSTORE step exposes the invalid state update."

Point at:
- Honest VM card.
- Claimed VM card.
- SSTORE mismatch.
- Resolved invalid state.

### 2:20-2:45 -- Architecture and design decisions

Say:
"The project connects mock Solidity contracts, local deployment artifacts, generated reports, deterministic frontend fallback data, and React visualizations. I intentionally kept the demo focused on the fraud-proof path instead of trying to build a full production rollup."

Point at:
- Contract/report/artifact references if visible.
- Deterministic visual data.
- Frontend explanation surface.

### 2:45-3:00 -- Close with hiring signal

Say:
"The hiring signal is protocol-level reasoning. I can go into the weeds, isolate the mechanism, build a working visualization, and come back with a clean mental model."

End on:
- SSTORE mismatch / resolved invalid state.

## Short 30-second cut

0:00-0:05
"Optimistic rollups move fast by assuming batches are valid unless challenged."

0:05-0:15
Show trade -> batch -> L1 claim.
"Trades become a batch, and the sequencer posts a claimed state root."

0:15-0:25
Show bad batch -> bisection -> Fraud Proof War.
"If the sequencer lies, the challenge narrows the trace to one invalid step."

0:25-0:30
Show SSTORE mismatch.
"This is where trust becomes verification."

## GIF / MP4 preview plan

Length: 8-12 seconds.
Loop:
1. Simulate Trade button.
2. Trade enters optimistic L2 lane.
3. Bad batch turns red.
4. Fraud Proof War cards animate.
5. SSTORE mismatch flashes.
6. Result: RESOLVED_INVALID.

Caption baked into preview:
"Optimistic fraud proof: bad batch -> bisection -> invalid state"

Prefer MP4/WebM over GIF if magro.dev supports it.

## Thumbnail plan

Title:
"CATCH THE LYING SEQUENCER"

Subtitle:
"Optimistic rollup fraud proof, step by step"

Visual composition:
Two opposing cards: Sequencer vs Challenger. Center: red bad batch and opcode mismatch. Background: L1/L2 bridge lines.

## Speaking guidance

This is the DeepWeeds video. You can use more technical vocabulary, but define each mechanism right when you introduce it.

Do not say: "This is a toy rollup."
Say: "This is a focused mechanics lab that isolates the fraud-proof path."

Confidence line:
"The hard part is not naming the components. The hard part is showing exactly where trust turns into verification."
