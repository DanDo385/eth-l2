import type {
  AppAction,
  AppState,
  BatchInfo,
  BatchPostedPayload,
  ErrorPayload,
} from "../types";

const MAX_BLOCK_LOG = 60;

export const initialState: AppState = {
  connected: false,
  running: false,
  blocks: { l1: 0, "op-l2": 0, "zk-l2": 0 },
  blockLog: [],
  batches: {},
  inspectedBatch: null,
  opcodeRaceData: null,
  zkInspectData: null,
  lastError: null,
  scoreboard: { opChallenges: 0, opResolved: 0, zkBatches: 0 },
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "WS_CONNECTED":
      return { ...state, connected: true };

    case "WS_DISCONNECTED":
      return { ...state, connected: false, running: false };

    case "WS_EVENT": {
      const { event } = action;

      switch (event.type) {
        case "block_mined": {
          const { chain, blockNum } = event.payload;
          return {
            ...state,
            blocks: { ...state.blocks, [chain]: blockNum },
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
          const { batchId } = event.payload;
          const existing = state.batches[batchId];
          if (!existing) return state;
          return {
            ...state,
            batches: {
              ...state.batches,
              [batchId]: { ...existing, flagged: true },
            },
            scoreboard: {
              ...state.scoreboard,
              opChallenges: state.scoreboard.opChallenges + 1,
            },
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
            scoreboard: {
              ...state.scoreboard,
              opResolved: state.scoreboard.opResolved + 1,
            },
          };
        }

        case "zk_inspect_ready": {
          return {
            ...state,
            scoreboard: {
              ...state.scoreboard,
              zkBatches: state.scoreboard.zkBatches + 1,
            },
          };
        }

        case "session_state_changed":
          return { ...state, running: event.payload.running };

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
      };
    }

    case "CLOSE_OPCODE_RACE":
      return { ...state, opcodeRaceData: null };

    case "SHOW_ZK_INSPECT":
      return { ...state, zkInspectData: action.payload };

    case "CLOSE_ZK_INSPECT":
      return { ...state, zkInspectData: null };

    case "DISMISS_ERROR":
      return { ...state, lastError: null };

    default:
      return state;
  }
}
