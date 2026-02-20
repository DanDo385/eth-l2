export interface Report {
  seed: number;
  addresses: {
    l1: { portal: string; disputeGame: string; verifier: string; zkRollup: string };
    opL2: { tradeEngine: string };
    zkL2: { tradeEngine: string };
  };
  op?: { batchesPath: string; receiptsPath: string; disputesPath: string };
  zk?: { batchesPath: string; receiptsPath: string };
  generatedAt?: string;
}

export interface OpBatch {
  batchId: number;
  l2BlockStart: number;
  l2BlockEnd: number;
  txCount: number;
  prevStateRoot: string;
  postStateRoot: string;
  correctStateRoot: string;
  batchDataHash: string;
  isBad: boolean;
  timestamp: number;
}

export interface OpDisputeRound {
  depth: number;
  submitter: string;
  role: string;
  claimedStateHash: string;
  position: number;
  l1TxHash: string;
  l1GasUsed: string;
}

export interface OpDispute {
  batchId: number;
  challenger: string;
  sequencer: string;
  maxDepth: number;
  rounds: OpDisputeRound[];
  challengeTxHash: string;
  resolutionTxHash: string;
  resolutionGasUsed: string;
  winner: string;
  result: string;
}

export interface Layer3Trade {
  id: number;
  trader: string;
  amountIn: string;
  amountOut: string;
  nonce: number;
  status: "pending" | "l2_executing" | "batched" | "l1_posted" | "finalized" | "invalidated";
  batchId?: number;
  chain: "op" | "zk";
}
