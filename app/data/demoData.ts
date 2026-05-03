import type { Layer3Trade, OpBatch, OpDispute, Report } from "../types";

export const MOCK_LAYER3_TRADES: Layer3Trade[] = [
  { id: 0, trader: "0x3C44...93BC", amountIn: "12 L3", amountOut: "1,184 L3", nonce: 0, status: "finalized", batchId: 0, chain: "op" },
  { id: 1, trader: "0x90F7...b906", amountIn: "8 L3", amountOut: "782 L3", nonce: 0, status: "finalized", batchId: 0, chain: "zk" },
  { id: 2, trader: "0x15d3...6A65", amountIn: "41 L3", amountOut: "4,018 L3", nonce: 0, status: "l1_posted", batchId: 1, chain: "op" },
  { id: 3, trader: "0x9965...04dc", amountIn: "18 L3", amountOut: "1,765 L3", nonce: 0, status: "invalidated", batchId: 1, chain: "op" },
];

const FALLBACK_REPORT: Report = {
  seed: 42,
  addresses: {
    l1: {
      portal: "0x9fE46736679d2D9a65F0992F2272dE9f3c7fa6e0",
      disputeGame: "0xe7f1725E7734CE288F8367e1Bb143E90bb3F0512",
      verifier: "0x5FbDB2315678afecb367f032d93F642f64180aa3",
      zkRollup: "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9",
    },
    opL2: { tradeEngine: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
    zkL2: { tradeEngine: "0x5FbDB2315678afecb367f032d93F642f64180aa3" },
  },
  generatedAt: "2026-02-17T22:13:10Z",
};

const FALLBACK_BATCHES: OpBatch[] = [
  {
    batchId: 0,
    l2BlockStart: 64,
    l2BlockEnd: 86,
    txCount: 21,
    prevStateRoot: "0x9b7a0f3b0e0a1111111111111111111111111111111111111111111111111111",
    postStateRoot: "0x4caa8c9e0e0a2222222222222222222222222222222222222222222222222222",
    correctStateRoot: "0x4caa8c9e0e0a2222222222222222222222222222222222222222222222222222",
    batchDataHash: "0x703965b778573a79b7233bb41348e76ba164a9030f2bdb63ebeb70d292da2300",
    isBad: false,
    timestamp: 1771366320,
  },
  {
    batchId: 1,
    l2BlockStart: 87,
    l2BlockEnd: 103,
    txCount: 13,
    prevStateRoot: "0xef1346fcc6d1420dc6de1117dfdae44f0e139c2b689821e609d69f0bab99f151",
    postStateRoot: "0xef1346fcc6d1420dc6de1117dfdae44f0e139c2b689821e609d69f0bab99f1ff",
    correctStateRoot: "0xef1346fcc6d1420dc6de1117dfdae44f0e139c2b689821e609d69f0bab99f151",
    batchDataHash: "0x703965b778573a79b7233bb41348e76ba164a9030f2bdb63ebeb70d292da2350",
    isBad: true,
    timestamp: 1771366380,
  },
];

const FALLBACK_DISPUTES: OpDispute[] = [
  {
    batchId: 1,
    challenger: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    sequencer: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
    maxDepth: 4,
    rounds: [
      { depth: 0, submitter: "0xf39F...266", role: "sequencer", claimedStateHash: "0x2739014e98fa52a60209a65b59069471847aa44553ae74256c5dc341650fc9b3", position: 1, l1TxHash: "0xcb46...becc", l1GasUsed: "0x1f18a" },
      { depth: 1, submitter: "0x7099...9C8", role: "challenger", claimedStateHash: "0x3fb33a91eb3ddeb93b2fbd3c4ab3c88e363f006f046b8287a3e952a054308218", position: 2, l1TxHash: "0x6eeb...e384", l1GasUsed: "0x1aeb2" },
      { depth: 2, submitter: "0xf39F...266", role: "sequencer", claimedStateHash: "0x4fbe17d708cefaf4ce6201911396ec5b8e53221bec2b266d3f8a737d64637320", position: 3, l1TxHash: "0xb78d...5f32", l1GasUsed: "0x1aebe" },
      { depth: 3, submitter: "0x7099...9C8", role: "challenger", claimedStateHash: "0xdca89ef37544f109c56cda9098c234f96d1ee0390124c93231187f19c23d0c27", position: 4, l1TxHash: "0xf36a...5447", l1GasUsed: "0x1aebe" },
    ],
    challengeTxHash: "0xeae56f75e64b320029de70ae906f81e7a977b11673e3e71872759d743cf34df1",
    resolutionTxHash: "0x13d082b7088388c03a78061dd1b1d43771f1fa81d073bc6402c7fd9394658b25",
    resolutionGasUsed: "0xb3f5",
    winner: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
    result: "RESOLVED_INVALID",
  },
];

async function getJson<T>(path: string, fallback: T): Promise<T> {
  try {
    const response = await fetch(path, { cache: "no-store" });
    if (!response.ok) return fallback;
    return (await response.json()) as T;
  } catch {
    return fallback;
  }
}

export function fetchReport() {
  return getJson<Report>("/report.json", FALLBACK_REPORT);
}

export async function fetchOpBatches() {
  const batches = await Promise.all([
    getJson<OpBatch>("/op/batches/batch_0.json", FALLBACK_BATCHES[0]),
    getJson<OpBatch>("/op/batches/batch_1.json", FALLBACK_BATCHES[1]),
  ]);
  return batches.sort((a, b) => a.batchId - b.batchId);
}

export async function fetchOpDisputes() {
  const dispute = await getJson<OpDispute>("/op/disputes/batch_1.json", FALLBACK_DISPUTES[0]);
  return [dispute];
}
