package chain

import "math/big"

// Demo economics — keep in sync with contracts/l1/OptimisticPortalMock.sol and swap engines.
const (
	// BondAmountWei matches OptimisticPortalMock.BOND_AMOUNT (0.1 ether).
	BondAmountWei int64 = 1e17

	// TraderSeedBalance is balanceA seeded per trader (HonestSwapEngine.seed units).
	TraderSeedBalance int64 = 10_000

	// ZKTraderSeedBalance seeds ZK-lane traders richly so mid-run token top-ups
	// never fire. The ZK sequencer's honest ledger (sequencer/ledger.go) starts
	// each trader at this same balance, so its witness pre-state stays in step
	// with the on-chain L2 balances without needing to observe top-up seeds.
	ZKTraderSeedBalance int64 = 1_000_000_000_000

	// TraderTopUpThreshold refills balanceA when it drops below this during a long demo run.
	TraderTopUpThreshold int64 = 500

	// DemoAccountETH is the native ETH balance set on each demo account at session start (Anvil cheat).
	DemoAccountETH int64 = 10_000
)

// Gas limits — must cover execution but not require 16M ETH headroom per tx.
const (
	GasLimitDefault  uint64 = 2_000_000
	GasLimitSwap     uint64 = 800_000
	GasLimitL1Portal uint64 = 2_500_000
	GasLimitSeed     uint64 = 400_000
)

var bondAmount = big.NewInt(BondAmountWei)

// BondAmount returns a copy of the portal/challenge bond (0.1 ETH).
func BondAmount() *big.Int {
	return new(big.Int).Set(bondAmount)
}

// DemoNativeBalance returns wei for anvil_setBalance funding.
func DemoNativeBalance() *big.Int {
	return new(big.Int).Mul(big.NewInt(DemoAccountETH), big.NewInt(1e18))
}
