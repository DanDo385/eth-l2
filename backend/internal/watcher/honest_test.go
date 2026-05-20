package watcher

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/common"
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

func TestHonestSim_apply_advancesSwapID(t *testing.T) {
	sim := newHonestSim([]common.Address{testTrader}, 1_000_000)
	_ = sim.apply(testTrader, big.NewInt(1), big.NewInt(0))
	_ = sim.apply(testTrader, big.NewInt(1), big.NewInt(1))
	if sim.nextSwapID != 2 {
		t.Errorf("expected nextSwapID=2, got %d", sim.nextSwapID)
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

// ── computeSHash ──────────────────────────────────────────────────────────────

func TestComputeSHash_nonZero(t *testing.T) {
	h := computeSHash(0, testTrader, big.NewInt(100), big.NewInt(9970), big.NewInt(0))
	if h == [32]byte{} {
		t.Error("expected non-zero sHash")
	}
}

func TestComputeSHash_deterministic(t *testing.T) {
	a := computeSHash(1, testTrader, big.NewInt(500), big.NewInt(49850), big.NewInt(1))
	b := computeSHash(1, testTrader, big.NewInt(500), big.NewInt(49850), big.NewInt(1))
	if a != b {
		t.Error("computeSHash should be deterministic")
	}
}

func TestComputeSHash_swapIDDifferentiates(t *testing.T) {
	a := computeSHash(0, testTrader, big.NewInt(100), big.NewInt(9970), big.NewInt(0))
	b := computeSHash(1, testTrader, big.NewInt(100), big.NewInt(9970), big.NewInt(0))
	if a == b {
		t.Error("different swapIDs should produce different hashes")
	}
}

func TestComputeSHash_traderDifferentiates(t *testing.T) {
	other := common.HexToAddress("0x2222222222222222222222222222222222222222")
	a := computeSHash(0, testTrader, big.NewInt(100), big.NewInt(9970), big.NewInt(0))
	b := computeSHash(0, other, big.NewInt(100), big.NewInt(9970), big.NewInt(0))
	if a == b {
		t.Error("different traders should produce different hashes")
	}
}

// ── computeNewRoot ────────────────────────────────────────────────────────────

func TestComputeNewRoot_nonZero(t *testing.T) {
	sHash := computeSHash(0, testTrader, big.NewInt(1), big.NewInt(99), big.NewInt(0))
	root := computeNewRoot([32]byte{}, sHash)
	if root == [32]byte{} {
		t.Error("expected non-zero new root")
	}
}

func TestComputeNewRoot_deterministic(t *testing.T) {
	var oldRoot [32]byte
	oldRoot[0] = 0xab
	var sHash [32]byte
	sHash[0] = 0xcd
	a := computeNewRoot(oldRoot, sHash)
	b := computeNewRoot(oldRoot, sHash)
	if a != b {
		t.Error("computeNewRoot should be deterministic")
	}
}

func TestComputeNewRoot_oldRootMatters(t *testing.T) {
	var sHash [32]byte
	sHash[1] = 0xff
	var rootA, rootB [32]byte
	rootA[0] = 0x01
	rootB[0] = 0x02
	a := computeNewRoot(rootA, sHash)
	b := computeNewRoot(rootB, sHash)
	if a == b {
		t.Error("different old roots should produce different new roots")
	}
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
