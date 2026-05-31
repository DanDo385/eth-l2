// ── Wire types (match Go backend JSON exactly) ──────────────────────────────

export interface FilteredStep {
  op: string;
  stack4: string[];
  storage?: Record<string, string> | null;
  pc: number;
}

export interface DivInfo {
  divergenceIdx: number;
  op: string;
  slot: string;
  honestVal: string;
  claimedVal: string;
  honestSteps: FilteredStep[];
  claimedSteps: FilteredStep[];
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

export interface DisputeResolvedPayload {
  batchId: number;
  divergenceIdx: number;
  op: string;
  slot: string;
  honestVal: string;
  claimedVal: string;
  honestSteps: FilteredStep[];
  claimedSteps: FilteredStep[];
}

export interface ZkInspectPayload {
  batchId: number;
  l2EndBlock: number;
  constraints: number;
  proveMs: number;
  verifyGas: number;
  accepted: boolean;
  reason?: string;
}

export interface ErrorPayload {
  chain: string;
  message: string;
}

export type WsEvent =
  | { type: "block_mined"; payload: BlockMinedPayload }
  | { type: "batch_posted"; payload: BatchPostedPayload }
  | { type: "batch_flagged"; payload: BatchFlaggedPayload }
  | { type: "dispute_resolved"; payload: DisputeResolvedPayload }
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
  /** ZK batch outcomes keyed by batchId — populated from WS, never auto-opens modals. */
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
