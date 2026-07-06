package challenge

import (
	"math/big"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

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
