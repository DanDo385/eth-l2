package watcher

import (
	"bytes"
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

var testTrader = common.HexToAddress("0x1111111111111111111111111111111111111111")

func TestHonestSim_apply_basic(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	err := sim.apply(testTrader, big.NewInt(1000), big.NewInt(0))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// balanceA should decrease
	if sim.balanceA[testTrader].Int64() != 999_000 {
		t.Errorf("expected balanceA=999000, got %s", sim.balanceA[testTrader])
	}
	// balanceB should be positive
	if sim.balanceB[testTrader].Sign() <= 0 {
		t.Error("expected positive balanceB after swap")
	}
}

func TestHonestSim_apply_amountOut_formula(t *testing.T) {
	// amountOut = amountIn * rate * (bpsDenominator - feeBPS) / bpsDenominator
	// = 1000 * 100 * 9970 / 10000 = 99700
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	_ = sim.apply(testTrader, big.NewInt(1000), big.NewInt(0))
	expected := int64(1000 * 100 * (10_000 - 30) / 10_000)
	if sim.balanceB[testTrader].Int64() != expected {
		t.Errorf("expected balanceB=%d, got %s", expected, sim.balanceB[testTrader])
	}
}

func TestHonestSim_apply_nonceMismatch(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	err := sim.apply(testTrader, big.NewInt(100), big.NewInt(1)) // nonce=1 but expected 0
	if err == nil {
		t.Error("expected nonce mismatch error")
	}
}

func TestHonestSim_apply_insufficientBalance(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 10)
	err := sim.apply(testTrader, big.NewInt(100), big.NewInt(0))
	if err == nil {
		t.Error("expected insufficient balance error")
	}
}

func TestHonestSim_apply_nonce_increments(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	if err := sim.apply(testTrader, big.NewInt(100), big.NewInt(0)); err != nil {
		t.Fatal(err)
	}
	if err := sim.apply(testTrader, big.NewInt(100), big.NewInt(1)); err != nil {
		t.Fatal(err)
	}
	if sim.nonces[testTrader].Int64() != 2 {
		t.Errorf("expected nonce=2, got %s", sim.nonces[testTrader])
	}
}

func TestHonestSim_stateRootChanges(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	before := sim.stateRoot
	_ = sim.apply(testTrader, big.NewInt(500), big.NewInt(0))
	if sim.stateRoot == before {
		t.Error("state root should change after apply")
	}
}

func TestHonestSim_unknownTrader_initialised(t *testing.T) {
	sim := newHonestSim([]common.Address{}, 0)
	unknown := common.HexToAddress("0xdeadbeef")
	// First call for an unknown trader should initialise with zero balance
	// but since balanceA=0 and amountIn>0, we expect an error — not a panic
	err := sim.apply(unknown, big.NewInt(1), big.NewInt(0))
	if err == nil {
		t.Error("expected insufficient balance for unknown trader with 0 balance")
	}
}

// ── balance-set state root (WO-1) ────────────────────────────────────────────

var traderX = common.HexToAddress("0x1111111111111111111111111111111111111111")
var traderY = common.HexToAddress("0x2222222222222222222222222222222222222222")

// The root is a commitment over final balances, so applying the same swaps in a
// different interleaving (across distinct accounts) yields the same root.
func TestHonestSim_root_isOrderIndependentAcrossAccounts(t *testing.T) {
	a := newHonestSim([]common.Address{traderX, traderY}, 1_000_000)
	_ = a.apply(traderX, big.NewInt(10), big.NewInt(0))
	_ = a.apply(traderY, big.NewInt(5), big.NewInt(0))

	b := newHonestSim([]common.Address{traderX, traderY}, 1_000_000)
	_ = b.apply(traderY, big.NewInt(5), big.NewInt(0))
	_ = b.apply(traderX, big.NewInt(10), big.NewInt(0))

	if a.stateRoot != b.stateRoot {
		t.Error("same final balances should commit to the same root regardless of swap order")
	}
}

// Different final balances must produce different roots.
func TestHonestSim_root_sensitiveToBalance(t *testing.T) {
	a := newHonestSim([]common.Address{traderX}, 1_000_000)
	_ = a.apply(traderX, big.NewInt(10), big.NewInt(0))

	b := newHonestSim([]common.Address{traderX}, 1_000_000)
	_ = b.apply(traderX, big.NewInt(11), big.NewInt(0))

	if a.stateRoot == b.stateRoot {
		t.Error("different balances should produce different roots")
	}
}

// Registration order is part of the commitment: the same balances registered in
// a different order produce a different root (mirrors the contract's fold order).
func TestHonestSim_root_sensitiveToRegistrationOrder(t *testing.T) {
	a := newHonestSim([]common.Address{traderX, traderY}, 1_000_000)
	b := newHonestSim([]common.Address{traderY, traderX}, 1_000_000)
	if a.stateRoot == b.stateRoot {
		t.Error("different registration order should produce different roots")
	}
}

// A seed (trader top-up) updates balanceA and therefore the root.
func TestHonestSim_applySeed_updatesRoot(t *testing.T) {
	sim := newHonestSim([]common.Address{traderX}, 1_000)
	before := sim.stateRoot
	sim.applySeed(traderX, big.NewInt(10_000))
	if sim.stateRoot == before {
		t.Error("seeding a new balanceA should change the root")
	}
	if sim.balanceA[traderX].Int64() != 10_000 {
		t.Errorf("expected balanceA=10000 after seed, got %s", sim.balanceA[traderX])
	}
}

// Pin the exact leaf and root encoding independently of sim.accountLeaf, so any
// drift from the Solidity _accountLeaf / _recomputeRoot encoding is caught. The
// same one-account scenario is pinned to the SAME literal in Solidity
// (SwapEngines.t.sol test_root_matchesGoReferenceScenario), proving cross-language
// parity of the commitment.
//
// Scenario: single account traderX, balanceA=1000, balanceB=0, nonce=0.
func TestHonestSim_root_pinnedFormula(t *testing.T) {
	sim := newHonestSim([]common.Address{traderX}, 1_000)

	// Build the leaf independently: address(20) | balanceA(32) | balanceB(32) | nonce(32).
	var leafBuf []byte
	leafBuf = append(leafBuf, traderX.Bytes()...)
	leafBuf = append(leafBuf, padLeft32(big.NewInt(1000))...)
	leafBuf = append(leafBuf, padLeft32(big.NewInt(0))...)
	leafBuf = append(leafBuf, padLeft32(big.NewInt(0))...)
	leaf := crypto.Keccak256(leafBuf)

	// root = keccak256(0x00..00(32) | leaf(32)).
	rootBuf := make([]byte, 64)
	copy(rootBuf[32:], leaf)
	want := crypto.Keccak256(rootBuf)

	if !bytes.Equal(sim.stateRoot[:], want) {
		t.Errorf("pinned root mismatch:\n got  %x\n want %x", sim.stateRoot[:], want)
	}
	t.Logf("reference one-account root = %x", want)
}

// ── padLeft32 ─────────────────────────────────────────────────────────────────

func TestPadLeft32_smallNumber(t *testing.T) {
	p := padLeft32(big.NewInt(1))
	if len(p) != 32 {
		t.Errorf("expected 32 bytes, got %d", len(p))
	}
	if p[31] != 1 {
		t.Errorf("expected last byte=1, got %d", p[31])
	}
}

func TestPadLeft32_nil(t *testing.T) {
	p := padLeft32(nil)
	if len(p) != 32 {
		t.Errorf("expected 32 bytes for nil, got %d", len(p))
	}
	for _, b := range p {
		if b != 0 {
			t.Error("nil should produce all-zero 32 bytes")
			break
		}
	}
}
