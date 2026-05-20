package challenge

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// ── computeMaxDepth ──────────────────────────────────────────────────────────

func TestComputeMaxDepth_minimumIsTwo(t *testing.T) {
	// Any txCount ≤ 4 rounds up to depth=2 (1<<2 = 4 ≥ txCount).
	for _, tc := range []int{0, 1, 2, 3, 4} {
		if d := computeMaxDepth(tc); d != 2 {
			t.Errorf("computeMaxDepth(%d) = %d, want 2", tc, d)
		}
	}
}

func TestComputeMaxDepth_five(t *testing.T) {
	// txCount=5: 1<<2=4 < 5, so depth increments to 3 (1<<3=8 ≥ 5).
	if d := computeMaxDepth(5); d != 3 {
		t.Errorf("computeMaxDepth(5) = %d, want 3", d)
	}
}

func TestComputeMaxDepth_exactPowerOfTwo(t *testing.T) {
	// txCount=8: 1<<2=4 < 8 → depth=3; 1<<3=8 ≥ 8 → stop at 3.
	if d := computeMaxDepth(8); d != 3 {
		t.Errorf("computeMaxDepth(8) = %d, want 3", d)
	}
}

func TestComputeMaxDepth_large(t *testing.T) {
	// txCount > 1024 should cap at 10 (1<<10 = 1024).
	cases := []int{1025, 10000, 999999}
	for _, tc := range cases {
		if d := computeMaxDepth(tc); d != 10 {
			t.Errorf("computeMaxDepth(%d) = %d, want 10 (cap)", tc, d)
		}
	}
}

func TestComputeMaxDepth_atCap(t *testing.T) {
	// txCount = 1024 = 1<<10, depth starts at 2; needs to reach 10 to satisfy 1<<10 ≥ 1024.
	if d := computeMaxDepth(1024); d != 10 {
		t.Errorf("computeMaxDepth(1024) = %d, want 10", d)
	}
}

func TestComputeMaxDepth_monotone(t *testing.T) {
	prev := computeMaxDepth(1)
	for n := 2; n <= 2000; n++ {
		cur := computeMaxDepth(n)
		if cur < prev {
			t.Errorf("computeMaxDepth(%d)=%d < computeMaxDepth(%d)=%d — not monotone", n, cur, n-1, prev)
		}
		prev = cur
	}
}

// ── copyOpts ─────────────────────────────────────────────────────────────────

func newTestOpts() *bind.TransactOpts {
	key, _ := crypto.GenerateKey()
	auth, _ := bind.NewKeyedTransactorWithChainID(key, big.NewInt(1))
	auth.Value = big.NewInt(1e18)
	auth.GasLimit = 100_000
	return auth
}

func TestCopyOpts_isIsolated(t *testing.T) {
	orig := newTestOpts()
	origAddr := orig.From
	origValue := new(big.Int).Set(orig.Value)

	cp := copyOpts(orig)
	cp.From = common.HexToAddress("0xdeadbeef")
	cp.Value = big.NewInt(0)

	if orig.From != origAddr {
		t.Error("copyOpts mutated orig.From")
	}
	if orig.Value.Cmp(origValue) != 0 {
		t.Error("copyOpts mutated orig.Value (Value is a pointer, should be shallow-copied)")
	}
}

func TestCopyOpts_preservesFields(t *testing.T) {
	orig := newTestOpts()
	orig.GasLimit = 77_777
	orig.Nonce = big.NewInt(42)

	cp := copyOpts(orig)
	if cp.GasLimit != 77_777 {
		t.Errorf("GasLimit: want 77777, got %d", cp.GasLimit)
	}
	if cp.Nonce == nil || cp.Nonce.Cmp(big.NewInt(42)) != 0 {
		t.Errorf("Nonce: want 42, got %v", cp.Nonce)
	}
}
