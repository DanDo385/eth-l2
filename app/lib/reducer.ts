import type {
  ApiStateSnapshot,
  AppAction,
  AppState,
  BatchInfo,
  BatchPostedPayload,
  BatchVerifiedPayload,
  BondSettledPayload,
  DisputeStagePayload,
  ErrorPayload,
  EventLogEntry,
  WsEvent,
} from "../types";
import { safeNum } from "./numbers";

const MAX_BLOCK_LOG = 60;
const MAX_EVENT_LOG = 160;

function normalizeScoreboard(
  sb: AppState["scoreboard"],
  patch: Partial<AppState["scoreboard"]> = {},
): AppState["scoreboard"] {
  return {
    opChallenges: safeNum(patch.opChallenges ?? sb.opChallenges),
    opResolved: safeNum(patch.opResolved ?? sb.opResolved),
    zkBatches: safeNum(patch.zkBatches ?? sb.zkBatches),
    zkAccepted: safeNum(patch.zkAccepted ?? sb.zkAccepted),
    zkRejected: safeNum(patch.zkRejected ?? sb.zkRejected),
  };
}

function layerForEvent(type: WsEvent["type"]): EventLogEntry["layer"] {
  if (type === "batch_verified") return "local";
  if (type === "block_mined" || type === "batch_posted") return type === "block_mined" ? "L2" : "L1";
  return "L1";
}

function eventSummary(event: WsEvent): string {
  switch (event.type) {
    case "block_mined":
      return `${event.payload.chain} block #${event.payload.blockNum}`;
    case "batch_posted":
      return `Batch #${event.payload.batchId} posted to L1 with ${event.payload.txCount} swap(s)`;
    case "batch_flagged":
      return `Batch #${event.payload.batchId} flagged suspicious: root mismatch`;
    case "batch_verified":
      return `Batch #${event.payload.batchId} ${event.payload.result === "verified_mismatch" ? "verified mismatch" : "verified valid"}`;
    case "batch_challenged":
      return `Batch #${event.payload.batchId} challenged on L1, bond locked`;
    case "dispute_stage":
      return `Batch #${event.payload.batchId}: ${event.payload.explanation}`;
    case "dispute_resolved":
      return `Batch #${event.payload.batchId} dispute resolved at ${event.payload.op}`;
    case "bond_settled":
      return `Batch #${event.payload.batchId} bonds settled: ${event.payload.outcome}`;
    case "zk_inspect_ready":
      return `ZK batch #${event.payload.batchId} ${event.payload.accepted ? "verified" : "rejected"} at validity gate`;
    case "session_state_changed":
      return event.payload.running
        ? event.payload.paused
          ? "Simulation paused"
          : "Simulation running"
        : "Simulation stopped";
    case "error_occurred":
      return `${event.payload.chain}: ${event.payload.message}`;
  }
}

function eventBatchId(event: WsEvent): number | undefined {
  const payload = event.payload as { batchId?: number };
  return typeof payload.batchId === "number" ? payload.batchId : undefined;
}

function appendEventLog(state: AppState, event: WsEvent): EventLogEntry[] {
  if (event.type === "block_mined" && state.blockLog.length % 5 !== 0) {
    return state.eventLog;
  }
  const next: EventLogEntry = {
    seq: state.eventLog.length + 1,
    event: event.type,
    layer: layerForEvent(event.type),
    batchId: eventBatchId(event),
    summary: eventSummary(event),
    status: "recorded",
  };
  return [...state.eventLog.slice(-(MAX_EVENT_LOG - 1)), next];
}

export const initialState: AppState = {
  connected: false,
  running: false,
  paused: false,
  blocks: { l1: 0, "op-l2": 0, "zk-l2": 0 },
  blockLog: [],
  eventLog: [],
  batches: {},
  inspectedBatch: null,
  opcodeRaceData: null,
  zkInspectData: null,
  zkRollups: {},
  exploredOpProofs: {},
  exploredZkProofs: {},
  lastError: null,
  scoreboard: { opChallenges: 0, opResolved: 0, zkBatches: 0, zkAccepted: 0, zkRejected: 0 },
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "WS_CONNECTED":
      return { ...state, connected: true };

    case "WS_DISCONNECTED":
      return { ...state, connected: false, running: false, paused: false };

    case "HYDRATE_STATE": {
      const snap = action.snapshot as ApiStateSnapshot;
      const batches = Object.fromEntries(
        (snap.batches ?? []).map((b) => [b.batchId, b]),
      ) as Record<number, BatchInfo>;
      const batchList = Object.values(batches);
      const opChallenges = batchList.filter((b) => b.flagged).length;
      const opResolved = batchList.filter((b) => b.resolved).length;

      return {
        ...state,
        running: snap.running ?? false,
        paused: snap.paused ?? false,
        blocks: {
          l1: safeNum(snap.blocks?.l1),
          "op-l2": safeNum(
            snap.blocks?.["op-l2"] ?? snap.blocks?.opL2,
          ),
          "zk-l2": safeNum(
            snap.blocks?.["zk-l2"] ?? snap.blocks?.zkL2,
          ),
        },
        batches,
        scoreboard: normalizeScoreboard(state.scoreboard, {
          opChallenges,
          opResolved,
        }),
      };
    }

    case "WS_EVENT": {
      const { event } = action;

      switch (event.type) {
        case "block_mined": {
          const { chain, blockNum } = event.payload;
          return {
            ...state,
            blocks: { ...state.blocks, [chain]: safeNum(blockNum) },
            blockLog: [
              ...state.blockLog.slice(-(MAX_BLOCK_LOG - 1)),
              { chain, blockNum },
            ],
            eventLog: appendEventLog(state, event),
          };
        }

        case "batch_posted": {
          const p = event.payload as BatchPostedPayload;
          const existing = state.batches[p.batchId];
          const info: BatchInfo = {
            batchId: p.batchId,
            engineType: p.engineType,
            postStateRoot: p.postStateRoot,
            l2StartBlock: p.l2StartBlock,
            l2EndBlock: p.l2EndBlock,
            txCount: p.txCount,
            swaps: p.swaps ?? existing?.swaps,
            flagged: existing?.flagged ?? false,
            challenged: existing?.challenged ?? false,
            resolved: existing?.resolved ?? false,
            finalized: existing?.finalized,
            submittedAt: existing?.submittedAt,
            bondSettlement: existing?.bondSettlement,
            status: existing?.status ?? (p.txCount === 0 ? "empty_warmup" : "challenge_window_open"),
            verification: existing?.verification,
            disputeStage: existing?.disputeStage,
            postedRoot: existing?.postedRoot,
            expectedRoot: existing?.expectedRoot,
            flagReason: existing?.flagReason,
            divergence: existing?.divergence,
          };
          return {
            ...state,
            batches: { ...state.batches, [p.batchId]: info },
            eventLog: appendEventLog(state, event),
          };
        }

        case "batch_flagged": {
          const p = event.payload;
          const existing = state.batches[p.batchId];
          const base: BatchInfo = existing ?? {
            batchId: p.batchId,
            engineType: "obvious",
            postStateRoot: p.postedRoot,
            l2StartBlock: p.l2EndBlock,
            l2EndBlock: p.l2EndBlock,
            txCount: 0,
            flagged: false,
            challenged: false,
            resolved: false,
          };
          const wasFlagged = base.flagged;
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...base,
                flagged: true,
                status: "suspicious",
                postedRoot: p.postedRoot,
                expectedRoot: p.expectedRoot,
                flagReason: p.reason,
              },
            },
            scoreboard: normalizeScoreboard(state.scoreboard, {
              opChallenges: wasFlagged
                ? state.scoreboard.opChallenges
                : safeNum(state.scoreboard.opChallenges) + 1,
            }),
            eventLog: appendEventLog(state, event),
          };
        }

        case "batch_verified": {
          const p = event.payload as BatchVerifiedPayload;
          const existing = state.batches[p.batchId];
          if (!existing) return { ...state, eventLog: appendEventLog(state, event) };
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...existing,
                flagged: existing.flagged || p.result === "verified_mismatch",
                status: p.result,
                verification: {
                  result: p.result,
                  costWei: p.costWei,
                  postedRoot: p.postedRoot,
                  expectedRoot: p.expectedRoot,
                  reason: p.reason,
                },
              },
            },
            eventLog: appendEventLog(state, event),
          };
        }

        case "batch_challenged": {
          const p = event.payload;
          const existing = state.batches[p.batchId];
          if (!existing) return state;
          if (existing.challenged) return state;
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: { ...existing, challenged: true, flagged: true, status: "challenged", disputeStage: "dispute_open" },
            },
            eventLog: appendEventLog(state, event),
          };
        }

        case "dispute_stage": {
          const p = event.payload as DisputeStagePayload;
          const existing = state.batches[p.batchId];
          if (!existing) return { ...state, eventLog: appendEventLog(state, event) };
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: { ...existing, status: p.stage, disputeStage: p.stage },
            },
            eventLog: appendEventLog(state, event),
          };
        }

        case "dispute_resolved": {
          const p = event.payload;
          const existing = state.batches[p.batchId];
          const base: BatchInfo = existing ?? {
            batchId: p.batchId,
            engineType: "obvious",
            postStateRoot: "",
            l2StartBlock: 0,
            l2EndBlock: 0,
            txCount: 0,
            flagged: true,
            challenged: false,
            resolved: false,
          };
          const divInfo = {
            divergenceIdx: p.divergenceIdx,
            op: p.op,
            slot: p.slot,
            honestVal: p.honestVal,
            claimedVal: p.claimedVal,
            honestSteps: p.honestSteps,
            claimedSteps: p.claimedSteps,
            rawHonestLen: p.rawHonestLen,
            rawClaimedLen: p.rawClaimedLen,
            onchainDivergenceStep: p.onchainDivergenceStep,
            lyingSource: p.lyingSource,
            honestSource: p.honestSource,
          };
          const wasResolved = base.resolved;
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...base,
                flagged: true,
                challenged: true,
                resolved: true,
                finalized: true,
                status: "rejected",
                disputeStage: "rejected",
                divergence: divInfo,
              },
            },
            scoreboard: normalizeScoreboard(state.scoreboard, {
              opResolved: wasResolved
                ? state.scoreboard.opResolved
                : safeNum(state.scoreboard.opResolved) + 1,
            }),
            eventLog: appendEventLog(state, event),
          };
        }

        case "bond_settled": {
          const p = event.payload as BondSettledPayload;
          const existing = state.batches[p.batchId];
          if (!existing) return state;
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...existing,
                finalized: true,
                status: p.outcome === "fraud" ? "rejected" : p.outcome === "challenge_failed" ? "accepted" : "finalized",
                bondSettlement: p,
              },
            },
            eventLog: appendEventLog(state, event),
          };
        }

        case "zk_inspect_ready": {
          const p = event.payload;
          return {
            ...state,
            zkRollups: { ...state.zkRollups, [p.batchId]: p },
            scoreboard: normalizeScoreboard(state.scoreboard, {
              zkBatches: safeNum(state.scoreboard.zkBatches) + 1,
              zkAccepted:
                safeNum(state.scoreboard.zkAccepted) + (p.accepted ? 1 : 0),
              zkRejected:
                safeNum(state.scoreboard.zkRejected) + (p.accepted ? 0 : 1),
            }),
            eventLog: appendEventLog(state, event),
          };
        }

        case "session_state_changed":
          if (!event.payload.running) {
            return {
              ...state,
              running: false,
              paused: false,
              batches: {},
              inspectedBatch: null,
              opcodeRaceData: null,
              zkRollups: {},
              eventLog: appendEventLog(state, event),
            };
          }
          return {
            ...state,
            running: event.payload.running,
            paused: event.payload.paused ?? false,
            eventLog: appendEventLog(state, event),
          };

        case "error_occurred":
          return { ...state, lastError: event.payload as ErrorPayload, eventLog: appendEventLog(state, event) };

        default:
          return state;
      }
    }

    case "INSPECT_BATCH": {
      const switching =
        action.batchId !== null && action.batchId !== state.inspectedBatch;
      return {
        ...state,
        inspectedBatch: action.batchId,
        ...(switching ? { opcodeRaceData: null, zkInspectData: null } : {}),
      };
    }

    case "SHOW_OPCODE_RACE": {
      const batch = state.batches[action.batchId];
      if (!batch?.divergence) return state;
      return {
        ...state,
        opcodeRaceData: {
          batchId: batch.batchId,
          divergenceIdx: batch.divergence.divergenceIdx,
          op: batch.divergence.op,
          slot: batch.divergence.slot,
          honestVal: batch.divergence.honestVal,
          claimedVal: batch.divergence.claimedVal,
          honestSteps: batch.divergence.honestSteps,
          claimedSteps: batch.divergence.claimedSteps,
          rawHonestLen: batch.divergence.rawHonestLen,
          rawClaimedLen: batch.divergence.rawClaimedLen,
          onchainDivergenceStep: batch.divergence.onchainDivergenceStep,
          lyingSource: batch.divergence.lyingSource,
          honestSource: batch.divergence.honestSource,
        },
        zkInspectData: null,
      };
    }

    case "CLOSE_OPCODE_RACE":
      return { ...state, opcodeRaceData: null };

    case "SHOW_ZK_INSPECT": {
      const data = state.zkRollups[action.batchId];
      if (!data) return state;
      return {
        ...state,
        zkInspectData: data,
        opcodeRaceData: null,
      };
    }

    case "CLOSE_ZK_INSPECT":
      return { ...state, zkInspectData: null };

    case "MARK_EXPLORED":
      if (action.lane === "op") {
        return {
          ...state,
          exploredOpProofs: { ...state.exploredOpProofs, [action.batchId]: true },
        };
      }
      return {
        ...state,
        exploredZkProofs: { ...state.exploredZkProofs, [action.batchId]: true },
      };

    case "DISMISS_ERROR":
      return { ...state, lastError: null };

    default:
      return state;
  }
}
