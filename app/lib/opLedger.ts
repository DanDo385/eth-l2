import type { BatchInfo } from "../types";
import { DEMO_ACCOUNTS, PORTAL_BOND_ETH } from "../data/accounts";
import { batchSwaps } from "../data/opTrackerEducation";

export interface LedgerLine {
  account: string;
  role: string;
  deltaEth?: string;
  deltaTokenA?: string;
  deltaTokenB?: string;
  note: string;
}

export interface EconomicEvent {
  sequence: number;
  eventName: string;
  layer: "L1" | "L2" | "local";
  payer: string;
  receiver: string;
  amount: string;
  asset: "ETH" | "Token A" | "Token B";
  before: string;
  after: string;
  fundStatus: "available" | "locked" | "slashed" | "returned" | "rewarded" | "spent";
  relatedBatch: string;
  explanation: string;
}

export interface BondLedger {
  sequencer: { posted: number; returned: number; slashed: number };
  challenger: { posted: number; returned: number; won: number; lost: number };
}

function weiToEth(wei: string): number {
  return Number(wei) / 1e18;
}

export function computeBondLedger(batches: BatchInfo[]): BondLedger {
  const ledger: BondLedger = {
    sequencer: { posted: 0, returned: 0, slashed: 0 },
    challenger: { posted: 0, returned: 0, won: 0, lost: 0 },
  };
  for (const b of batches) {
    ledger.sequencer.posted += PORTAL_BOND_ETH;
    const settle = b.bondSettlement;
    if (!settle) continue;
    if (settle.outcome === "unchallenged") {
      ledger.sequencer.returned += weiToEth(settle.payoutWei);
    } else if (settle.outcome === "fraud") {
      ledger.challenger.posted += PORTAL_BOND_ETH;
      ledger.challenger.won += weiToEth(settle.payoutWei);
      ledger.sequencer.slashed += PORTAL_BOND_ETH;
      ledger.challenger.returned += weiToEth(settle.chalBondWei);
    } else if (settle.outcome === "challenge_failed") {
      ledger.challenger.posted += PORTAL_BOND_ETH;
      ledger.challenger.lost += PORTAL_BOND_ETH;
      ledger.sequencer.returned += weiToEth(settle.payoutWei);
    }
  }
  return ledger;
}

export function batchEconomicEvents(batch: BatchInfo): EconomicEvent[] {
  const events: EconomicEvent[] = [];
  const seq = DEMO_ACCOUNTS[1].role;
  const chal = DEMO_ACCOUNTS[2].role;
  const escrow = "Dispute escrow";
  let n = 1;

  events.push({
    sequence: n++,
    eventName: "Proposer posts output root bond",
    layer: "L1",
    payer: seq,
    receiver: escrow,
    amount: `-${PORTAL_BOND_ETH.toFixed(2)}`,
    asset: "ETH",
    before: "available",
    after: "locked",
    fundStatus: "locked",
    relatedBatch: `#${batch.batchId}`,
    explanation: "Sequencer/proposer locks collateral with the output root assertion.",
  });

  if (batch.verification) {
    events.push({
      sequence: n++,
      eventName: "User verifies locally",
      layer: "local",
      payer: chal,
      receiver: "Local verifier",
      amount: `-${weiToEth(batch.verification.costWei).toFixed(2)}`,
      asset: "ETH",
      before: "available",
      after: "spent",
      fundStatus: "spent",
      relatedBatch: `#${batch.batchId}`,
      explanation: batch.verification.reason,
    });
  }

  if (batch.challenged || batch.bondSettlement?.outcome === "fraud" || batch.bondSettlement?.outcome === "challenge_failed") {
    events.push({
      sequence: n++,
      eventName: "User posts challenge bond",
      layer: "L1",
      payer: chal,
      receiver: escrow,
      amount: `-${PORTAL_BOND_ETH.toFixed(2)}`,
      asset: "ETH",
      before: "available",
      after: "locked",
      fundStatus: "locked",
      relatedBatch: `#${batch.batchId}`,
      explanation: "Challenger bond makes invalid disputes costly.",
    });
    events.push({
      sequence: n++,
      eventName: "Challenge transaction submitted",
      layer: "L1",
      payer: chal,
      receiver: "Ethereum validators",
      amount: "-0.08",
      asset: "ETH",
      before: "available",
      after: "spent",
      fundStatus: "spent",
      relatedBatch: `#${batch.batchId}`,
      explanation: "Illustrative L1 gas cost for submitting the challenge transaction.",
    });
  }

  const settle = batch.bondSettlement;
  if (settle?.outcome === "fraud") {
    events.push({
      sequence: n++,
      eventName: "Bad root rejected",
      layer: "L1",
      payer: "Output root",
      receiver: "Canonical chain",
      amount: "0.00",
      asset: "ETH",
      before: "pending",
      after: "rejected",
      fundStatus: "slashed",
      relatedBatch: `#${batch.batchId}`,
      explanation: "Withdrawals based on this bad root cannot finalize.",
    });
    events.push({
      sequence: n++,
      eventName: "Proposer bond slashed and challenger paid",
      layer: "L1",
      payer: escrow,
      receiver: chal,
      amount: `+${weiToEth(settle.payoutWei).toFixed(2)}`,
      asset: "ETH",
      before: "locked",
      after: "rewarded",
      fundStatus: "rewarded",
      relatedBatch: `#${batch.batchId}`,
      explanation: "Challenger receives the bond pot minus the burn.",
    });
  } else if (settle?.outcome === "challenge_failed") {
    events.push({
      sequence: n++,
      eventName: "Invalid challenge resolved",
      layer: "L1",
      payer: escrow,
      receiver: seq,
      amount: `+${weiToEth(settle.payoutWei).toFixed(2)}`,
      asset: "ETH",
      before: "locked",
      after: "returned",
      fundStatus: "returned",
      relatedBatch: `#${batch.batchId}`,
      explanation: "The output root survives and the challenger bond is penalized.",
    });
  } else if (settle?.outcome === "unchallenged") {
    events.push({
      sequence: n++,
      eventName: "Root finalized",
      layer: "L1",
      payer: escrow,
      receiver: seq,
      amount: `+${weiToEth(settle.payoutWei).toFixed(2)}`,
      asset: "ETH",
      before: "locked",
      after: "returned",
      fundStatus: "returned",
      relatedBatch: `#${batch.batchId}`,
      explanation: "Challenge window expired with no dispute.",
    });
  }

  return events;
}

export function batchLedgerLines(batch: BatchInfo): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const seq = DEMO_ACCOUNTS[1];
  const chal = DEMO_ACCOUNTS[2];
  const swaps = batchSwaps(batch);

  lines.push({
    account: seq.role,
    role: seq.addr,
    deltaEth: `−${PORTAL_BOND_ETH.toFixed(2)}`,
    note: `postBatch #${batch.batchId} — bond locked on L1`,
  });

  for (const swap of swaps) {
    const trader = DEMO_ACCOUNTS[3 + swap.traderIndex];
    const honest = swap.honestOut;
    const claimed = swap.claimedOut;
    const isFraud = batch.engineType !== "honest";

    if (!isFraud) {
      lines.push({
        account: trader.role,
        role: trader.addr,
        deltaTokenA: `−${swap.amountIn}`,
        deltaTokenB: `+${honest}`,
        note: `Swap L2 block ${swap.l2Block} — honest execution`,
      });
    } else if (batch.resolved) {
      lines.push({
        account: trader.role,
        role: trader.addr,
        deltaTokenA: "0",
        deltaTokenB: swap.isDivergent ? `+${claimed} → 0` : `+${claimed} → +${honest}`,
        note: swap.isDivergent
          ? "Fraud pin — balanceB write reverted with batch"
          : "Rolled back then re-queued with honest amountOut",
      });
    } else {
      lines.push({
        account: trader.role,
        role: trader.addr,
        deltaTokenA: `−${swap.amountIn}`,
        deltaTokenB: `+${claimed}${claimed !== honest ? ` (honest would be +${honest})` : ""}`,
        note: swap.isDivergent
          ? "Divergence target — wrong balanceB credited"
          : "Bundled with bad root — will roll back if challenged",
      });
    }
  }

  const settle = batch.bondSettlement;
  if (settle) {
    const payout = weiToEth(settle.payoutWei).toFixed(3);
    const burn = weiToEth(settle.burnedWei).toFixed(3);
    if (settle.outcome === "fraud") {
      lines.push({
        account: chal.role,
        role: chal.addr,
        deltaEth: `−${PORTAL_BOND_ETH.toFixed(2)} then +${payout}`,
        note: `Won dispute — ${burn} ETH burned from loser's stake`,
      });
      lines.push({
        account: seq.role,
        role: seq.addr,
        deltaEth: `−${PORTAL_BOND_ETH.toFixed(2)}`,
        note: "Sequencer bond forfeited — fraud proven",
      });
    } else {
      lines.push({
        account: seq.role,
        role: seq.addr,
        deltaEth: `+${payout}`,
        note: "Challenge window expired — bond returned",
      });
    }
  } else if (batch.challenged && !batch.resolved) {
    lines.push({
      account: chal.role,
      role: chal.addr,
      deltaEth: `−${PORTAL_BOND_ETH.toFixed(2)}`,
      note: "Challenge bond locked while FraudProofGame runs",
    });
  }

  return lines;
}

export function fraudBatches(batches: BatchInfo[]): BatchInfo[] {
  return batches
    .filter((b) => b.engineType !== "honest" || b.flagged)
    .sort((a, b) => b.batchId - a.batchId);
}
