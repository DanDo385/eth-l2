/** Keep in sync with backend/internal/engine/session_state.go batchEvery */
export const BATCH_WINDOW = 5;

/** Matches OptimisticPortalMock.BOND_AMOUNT, shown in challenge copy. */
export const PORTAL_BOND_ETH = 0.1;

/** Mirrors OptimisticPortalMock.CHALLENGE_WINDOW (seconds). Scaled L1 block time in the sim. */
export const CHALLENGE_WINDOW_SECONDS = 120;

/** Loser's slashed bond burned on fraud resolution (10%). */
export const SLASH_BURN_BPS = 1000;

// Swap economics, mirror the constants in contracts/l2/HonestSwapEngine.sol.
// amountOut = (amountIn * RATE) * (BPS_DENOMINATOR - FEE_BPS) / BPS_DENOMINATOR
// The "subtle lie" engine drops the fee term and credits the gross amount.
export const SWAP_RATE = 100;
export const SWAP_FEE_BPS = 30; // 0.30%
export const BPS_DENOMINATOR = 10_000;
