package sequencer

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// Swap economics, mirror contracts/l2/HonestSwapEngine.sol and the other engines.
const (
	zkRate           = 100
	zkFeeBPS         = 30
	zkBPSDenominator = 10_000
)

// zkLedger is the ZK sequencer's authoritative honest state. Its root is the
// same balance-set commitment as SwapEngineStorage._recomputeRoot and the
// watcher's honestSim (WO-1): leaf = keccak256(account, balanceA, balanceB,
// nonce), folded in registration order. Cross-language parity with the Solidity
// verifier is pinned in ledger_test.go against the same reference root as
// SwapEngines.t.sol / honest_test.go.
type zkLedger struct {
	balanceA   map[common.Address]*big.Int
	balanceB   map[common.Address]*big.Int
	nonces     map[common.Address]*big.Int
	accounts   []common.Address
	registered map[common.Address]bool
}

type ledgerAccount struct {
	addr     common.Address
	balanceA *big.Int
	balanceB *big.Int
	nonce    *big.Int
}

func newZkLedger(traders []common.Address, seedBal int64) *zkLedger {
	l := &zkLedger{
		balanceA:   make(map[common.Address]*big.Int),
		balanceB:   make(map[common.Address]*big.Int),
		nonces:     make(map[common.Address]*big.Int),
		registered: make(map[common.Address]bool),
	}
	for _, t := range traders {
		l.register(t)
		l.balanceA[t] = big.NewInt(seedBal)
	}
	return l
}

func (l *zkLedger) register(a common.Address) {
	if l.registered[a] {
		return
	}
	l.registered[a] = true
	l.accounts = append(l.accounts, a)
	if l.balanceA[a] == nil {
		l.balanceA[a] = big.NewInt(0)
	}
	if l.balanceB[a] == nil {
		l.balanceB[a] = big.NewInt(0)
	}
	if l.nonces[a] == nil {
		l.nonces[a] = big.NewInt(0)
	}
}

func (l *zkLedger) clone() *zkLedger {
	c := &zkLedger{
		balanceA:   make(map[common.Address]*big.Int, len(l.balanceA)),
		balanceB:   make(map[common.Address]*big.Int, len(l.balanceB)),
		nonces:     make(map[common.Address]*big.Int, len(l.nonces)),
		registered: make(map[common.Address]bool, len(l.registered)),
		accounts:   append([]common.Address(nil), l.accounts...),
	}
	for k, v := range l.balanceA {
		c.balanceA[k] = new(big.Int).Set(v)
	}
	for k, v := range l.balanceB {
		c.balanceB[k] = new(big.Int).Set(v)
	}
	for k, v := range l.nonces {
		c.nonces[k] = new(big.Int).Set(v)
	}
	for k, v := range l.registered {
		c.registered[k] = v
	}
	return c
}

// swapOut is the per-engine output amount. "honest" mirrors HonestSwapEngine;
// the others mirror the lying/buggy engines and are used only to build the
// wrong claimed root a fraud/bug batch would post.
func swapOut(amountIn *big.Int, mode string) *big.Int {
	gross := new(big.Int).Mul(amountIn, big.NewInt(zkRate))
	honest := new(big.Int).Mul(gross, big.NewInt(zkBPSDenominator-zkFeeBPS))
	honest.Div(honest, big.NewInt(zkBPSDenominator))
	switch mode {
	case "obvious": // doubled output
		return new(big.Int).Mul(honest, big.NewInt(2))
	case "subtle": // skipped fee, credit gross
		return gross
	case "buggy": // early division truncates: amountIn * ((RATE*(D-F))/D)
		perUnit := big.NewInt(zkRate * (zkBPSDenominator - zkFeeBPS) / zkBPSDenominator)
		return new(big.Int).Mul(amountIn, perUnit)
	default:
		return honest
	}
}

// applySwap applies one swap under the given mode. A swap whose nonce/balance
// does not match the ledger is skipped (should not happen for successful
// on-chain swaps, which the sequencer filters to before calling this).
func (l *zkLedger) applySwap(sw decodedSwap, mode string) {
	l.register(sw.trader)
	if l.nonces[sw.trader].Cmp(sw.nonce) != 0 || l.balanceA[sw.trader].Cmp(sw.amountIn) < 0 {
		return
	}
	l.nonces[sw.trader].Add(l.nonces[sw.trader], big.NewInt(1))
	l.balanceA[sw.trader].Sub(l.balanceA[sw.trader], sw.amountIn)
	l.balanceB[sw.trader].Add(l.balanceB[sw.trader], swapOut(sw.amountIn, mode))
}

func (l *zkLedger) applyBatch(swaps []decodedSwap, mode string) {
	for _, sw := range swaps {
		l.applySwap(sw, mode)
	}
}

// projectedRoot returns the root after applying swaps under mode, without
// mutating the ledger.
func (l *zkLedger) projectedRoot(swaps []decodedSwap, mode string) [32]byte {
	c := l.clone()
	c.applyBatch(swaps, mode)
	return c.root()
}

func (l *zkLedger) accountLeaf(a common.Address) [32]byte {
	buf := make([]byte, 0, 20+32*3)
	buf = append(buf, a.Bytes()...)
	buf = append(buf, zkPadLeft32(l.balanceA[a])...)
	buf = append(buf, zkPadLeft32(l.balanceB[a])...)
	buf = append(buf, zkPadLeft32(l.nonces[a])...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

func (l *zkLedger) root() [32]byte {
	var acc [32]byte
	for _, a := range l.accounts {
		leaf := l.accountLeaf(a)
		buf := make([]byte, 64)
		copy(buf[:32], acc[:])
		copy(buf[32:], leaf[:])
		copy(acc[:], crypto.Keccak256(buf))
	}
	return acc
}

func (l *zkLedger) snapshot() []ledgerAccount {
	out := make([]ledgerAccount, len(l.accounts))
	for i, a := range l.accounts {
		out[i] = ledgerAccount{
			addr:     a,
			balanceA: new(big.Int).Set(l.balanceA[a]),
			balanceB: new(big.Int).Set(l.balanceB[a]),
			nonce:    new(big.Int).Set(l.nonces[a]),
		}
	}
	return out
}

func zkPadLeft32(n *big.Int) []byte {
	out := make([]byte, 32)
	if n == nil {
		return out
	}
	b := n.Bytes()
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	copy(out[32-len(b):], b)
	return out
}
