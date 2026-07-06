// ── Wire types (match Go backend JSON exactly) ──────────────────────────────

export interface FilteredStep {
  op: string;
  stack4: string[];
  storage?: Record<string, string> | null;
  pc: number;
}

/** A resolved Solidity source location (from the deployed-bytecode source map). */
export interface SourceLoc {
  file: string;
  line: number;
  col: number;
  snippet: string;
  lineText: string;
}

export interface DivInfo {
  divergenceIdx: number;
  op: string;
  slot: string;
  honestVal: string;
  claimedVal: string;
  honestSteps: FilteredStep[];
  claimedSteps: FilteredStep[];
  /** Total EVM instructions executed before filtering to salient state-touching ops. */
  rawHonestLen?: number;
  rawClaimedLen?: number;
  /** The swap-VM step the on-chain fraud proof isolated the fraud to. */
  onchainDivergenceStep?: number;
  /** The deviating Solidity line in the lying/buggy engine, and honest's equivalent. */
  lyingSource?: SourceLoc;
  honestSource?: SourceLoc;
}

export interface BatchInfo {
  batchId: number;
  engineType: "honest" | "obvious" | "subtle";
  postStateRoot: string;
  l2StartBlock: number;
  l2EndBlock: number;
  txCount: number;
  flagged: boolean;
  postedRoot?: string;
  expectedRoot?: string;
  flagReason?: string;
  challenged: boolean;
  resolved: boolean;
  finalized?: boolean;
  submittedAt?: number;
  bondSettlement?: BondSettledPayload;
  divergence?: DivInfo;
}

// ── Event payloads ───────────────────────────────────────────────────────────

export interface BlockMinedPayload {
  chain: string;
  blockNum: number;
}

export interface BatchPostedPayload {
  batchId: number;
  postStateRoot: string;
  l2StartBlock: number;
  l2EndBlock: number;
  txCount: number;
  engineType: "honest" | "obvious" | "subtle";
}

export interface BatchFlaggedPayload {
  batchId: number;
  postedRoot: string;
  expectedRoot: string;
  l2EndBlock: number;
  reason: string;
}

export interface BatchChallengedPayload {
  batchId: number;
}

export interface DisputeResolvedPayload {
  batchId: number;
  divergenceIdx: number;
  op: string;
  slot: string;
  honestVal: string;
  claimedVal: string;
  honestSteps: FilteredStep[];
  claimedSteps: FilteredStep[];
  /** Total EVM instructions executed before filtering to salient state-touching ops. */
  rawHonestLen?: number;
  rawClaimedLen?: number;
  onchainDivergenceStep?: number;
  lyingSource?: SourceLoc;
  honestSource?: SourceLoc;
}

export interface ZkInspectPayload {
  batchId: number;
  l2EndBlock: number;
  constraints: number;
  proveMs: number;
  verifyGas: number;
  accepted: boolean;
  reason?: string;
  /** Claim the sequencer posted: "honest" | "obvious" | "subtle" | "buggy". */
  engineType?: "honest" | "obvious" | "subtle" | "buggy";
  txCount?: number;
}

/** Collateral waterfall after a batch finalizes on L1 (WO-5). Amounts are wei strings. */
export interface BondSettledPayload {
  batchId: number;
  outcome: "fraud" | "unchallenged";
  winner: "challenger" | "sequencer";
  seqBondWei: string;
  chalBondWei: string;
  payoutWei: string;
  burnedWei: string;
}

export interface ErrorPayload {
  chain: string;
  message: string;
}

export type WsEvent =
  | { type: "block_mined"; payload: BlockMinedPayload }
  | { type: "batch_posted"; payload: BatchPostedPayload }
  | { type: "batch_flagged"; payload: BatchFlaggedPayload }
  | { type: "batch_challenged"; payload: BatchChallengedPayload }
  | { type: "dispute_resolved"; payload: DisputeResolvedPayload }
  | { type: "bond_settled"; payload: BondSettledPayload }
  | { type: "zk_inspect_ready"; payload: ZkInspectPayload }
  | { type: "session_state_changed"; payload: { running: boolean; paused: boolean } }
  | { type: "error_occurred"; payload: ErrorPayload };

// ── App state ────────────────────────────────────────────────────────────────

export interface BlockNums {
  l1: number;
  "op-l2": number;
  "zk-l2": number;
  [key: string]: number;
}

export interface AppState {
  connected: boolean;
  running: boolean;
  paused: boolean;
  blocks: BlockNums;
  blockLog: { chain: string; blockNum: number }[];
  batches: Record<number, BatchInfo>;
  inspectedBatch: number | null;
  opcodeRaceData: DisputeResolvedPayload | null;
  zkInspectData: ZkInspectPayload | null;
  /** ZK batch outcomes keyed by batchId, populated from WS, never auto-opens modals. */
  zkRollups: Record<number, ZkInspectPayload>;
  exploredOpProofs: Record<number, true>;
  exploredZkProofs: Record<number, true>;
  lastError: ErrorPayload | null;
  scoreboard: {
    opChallenges: number;
    opResolved: number;
    zkBatches: number;
    zkAccepted: number;
    zkRejected: number;
  };
}

export interface ApiStateSnapshot {
  running: boolean;
  paused?: boolean;
  blocks: {
    l1?: number;
    opL2?: number;
    zkL2?: number;
    "op-l2"?: number;
    "zk-l2"?: number;
  };
  batches: BatchInfo[];
}

export type AppAction =
  | { type: "WS_CONNECTED" }
  | { type: "WS_DISCONNECTED" }
  | { type: "WS_EVENT"; event: WsEvent }
  | { type: "HYDRATE_STATE"; snapshot: ApiStateSnapshot }
  | { type: "INSPECT_BATCH"; batchId: number | null }
  | { type: "SHOW_OPCODE_RACE"; batchId: number }
  | { type: "CLOSE_OPCODE_RACE" }
  | { type: "SHOW_ZK_INSPECT"; batchId: number }
  | { type: "CLOSE_ZK_INSPECT" }
  | { type: "MARK_EXPLORED"; lane: "op" | "zk"; batchId: number }
  | { type: "DISMISS_ERROR" };
