import type { EngineType } from "./traceNarrative";

/** One highlighted Solidity line inside a multi-line exhibit. */
export interface SourceLine {
  n: number;
  text: string;
  /** Mark the statement that diverges between engines. */
  highlight?: boolean;
  /** Soft emphasis for supporting math (gross, fee) without being the lie. */
  dim?: boolean;
}

export interface EngineSourceExhibit {
  file: string;
  contract: string;
  role: "honest" | "lying";
  caption: string;
  lines: SourceLine[];
}

export interface EngineCompareBundle {
  title: string;
  summary: string;
  honest: EngineSourceExhibit;
  lying: EngineSourceExhibit;
}

const HONEST_SWAP_MATH: SourceLine[] = [
  { n: 23, text: "uint256 gross = amountIn * RATE;", dim: true },
  {
    n: 24,
    text: "amountOut = (gross * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;",
    highlight: true,
  },
  { n: 26, text: "_balanceB[trader] = _balanceB[trader] + amountOut;", dim: true },
];

const OBVIOUS_SWAP_MATH: SourceLine[] = [
  { n: 27, text: "uint256 gross = amountIn * RATE;", dim: true },
  {
    n: 28,
    text: "uint256 honest = (gross * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;",
    dim: true,
  },
  { n: 29, text: "amountOut = honest * 2; // <-- the lie", highlight: true },
  { n: 31, text: "_balanceB[trader] = _balanceB[trader] + amountOut;", dim: true },
];

const SUBTLE_SWAP_MATH: SourceLine[] = [
  { n: 28, text: "uint256 gross = amountIn * RATE;", dim: true },
  {
    n: 29,
    text: "uint256 _unusedFee = (gross * FEE_BPS) / BPS_DENOMINATOR;",
    dim: true,
  },
  {
    n: 30,
    text: "amountOut = gross; // <-- the lie: should have been gross - _unusedFee",
    highlight: true,
  },
  { n: 35, text: "_balanceB[trader] = _balanceB[trader] + amountOut;", dim: true },
];

const BUGGY_SWAP_MATH: SourceLine[] = [
  {
    n: 38,
    text: "uint256 netRatePerUnit = (RATE * (BPS_DENOMINATOR - FEE_BPS)) / BPS_DENOMINATOR;",
    highlight: true,
  },
  { n: 39, text: "amountOut = amountIn * netRatePerUnit;", highlight: true },
  { n: 41, text: "_balanceB[trader] = _balanceB[trader] + amountOut;", dim: true },
];

function honestExhibit(): EngineSourceExhibit {
  return {
    file: "contracts/l2/HonestSwapEngine.sol",
    contract: "HonestSwapEngine",
    role: "honest",
    caption: "Verified swap math — fee applied before crediting token-B",
    lines: HONEST_SWAP_MATH,
  };
}

/**
 * Multi-line Solidity exhibits for the fraud verdict.
 * Mirrors the live contracts under contracts/l2/ so the UI can show more than
 * the single source-map line the backend resolves.
 */
export function engineCompareBundle(
  engineType?: EngineType | "buggy" | string | null,
): EngineCompareBundle | null {
  switch (engineType) {
    case "obvious":
      return {
        title: "Honest engine vs LyingSwapEngineObvious",
        summary:
          "Same ABI and storage layout. The lying engine computes the honest amountOut, then doubles it before writing _balanceB.",
        honest: honestExhibit(),
        lying: {
          file: "contracts/l2/LyingSwapEngineObvious.sol",
          contract: "LyingSwapEngineObvious",
          role: "lying",
          caption: "Obvious lie — flatly wrong output amount",
          lines: OBVIOUS_SWAP_MATH,
        },
      };
    case "subtle":
      return {
        title: "Honest engine vs LyingSwapEngineSubtle",
        summary:
          "Same ABI and storage layout. The lying engine still reads FEE_BPS so the bytecode shape looks familiar, then ignores the fee and credits gross.",
        honest: honestExhibit(),
        lying: {
          file: "contracts/l2/LyingSwapEngineSubtle.sol",
          contract: "LyingSwapEngineSubtle",
          role: "lying",
          caption: "Subtle lie — 0.30% fee silently skipped",
          lines: SUBTLE_SWAP_MATH,
        },
      };
    case "buggy":
      return {
        title: "Honest engine vs BuggySwapEngine",
        summary:
          "Not a deliberate lie — a precision bug. Dividing before multiplying truncates the per-unit rate, undercrediting the trader. A validity gate still rejects it.",
        honest: honestExhibit(),
        lying: {
          file: "contracts/l2/BuggySwapEngine.sol",
          contract: "BuggySwapEngine",
          role: "lying",
          caption: "Bug — early division truncates netRatePerUnit",
          lines: BUGGY_SWAP_MATH,
        },
      };
    default:
      return null;
  }
}
