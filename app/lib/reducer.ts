import type {
  ApiStateSnapshot,
  AppAction,
  AppState,
  BatchInfo,
  BatchPostedPayload,
  ErrorPayload,
} from "../types";
import { safeNum } from "./numbers";

const MAX_BLOCK_LOG = 60;

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

export const initialState: AppState = {
  connected: false,
  running: false,
  paused: false,
  blocks: { l1: 0, "op-l2": 0, "zk-l2": 0 },
  blockLog: [],
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
          };
        }

        case "batch_posted": {
          const p = event.payload as BatchPostedPayload;
          const info: BatchInfo = {
            batchId: p.batchId,
            engineType: p.engineType,
            postStateRoot: p.postStateRoot,
            l2StartBlock: p.l2StartBlock,
            l2EndBlock: p.l2EndBlock,
            txCount: p.txCount,
            flagged: false,
            challenged: false,
            resolved: false,
          };
          return {
            ...state,
            batches: { ...state.batches, [p.batchId]: info },
          };
        }

        case "batch_flagged": {
          const p = event.payload;
          const existing = state.batches[p.batchId];
          if (!existing) return state;
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...existing,
                flagged: true,
                postedRoot: p.postedRoot,
                expectedRoot: p.expectedRoot,
                flagReason: p.reason,
              },
            },
            inspectedBatch: state.inspectedBatch,
            scoreboard: normalizeScoreboard(state.scoreboard, {
              opChallenges: safeNum(state.scoreboard.opChallenges) + 1,
            }),
          };
        }

        case "dispute_resolved": {
          const p = event.payload;
          const existing = state.batches[p.batchId];
          if (!existing) return state;
          const divInfo = {
            divergenceIdx: p.divergenceIdx,
            op: p.op,
            slot: p.slot,
            honestVal: p.honestVal,
            claimedVal: p.claimedVal,
            honestSteps: p.honestSteps,
            claimedSteps: p.claimedSteps,
          };
          return {
            ...state,
            batches: {
              ...state.batches,
              [p.batchId]: {
                ...existing,
                challenged: true,
                resolved: true,
                divergence: divInfo,
              },
            },
            scoreboard: normalizeScoreboard(state.scoreboard, {
              opResolved: safeNum(state.scoreboard.opResolved) + 1,
            }),
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
          };
        }

        case "session_state_changed":
          return {
            ...state,
            running: event.payload.running,
            paused: event.payload.paused ?? false,
          };

        case "error_occurred":
          return { ...state, lastError: event.payload as ErrorPayload };

        default:
          return state;
      }
    }

    case "INSPECT_BATCH":
      return { ...state, inspectedBatch: action.batchId };

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
