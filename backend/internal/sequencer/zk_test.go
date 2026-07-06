package sequencer

import (
	"math/big"
	"strings"
	"testing"

	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

// Guards the struct<->tuple mapping the live sequencer relies on: if a field
// name or type drifts from zkRollupABIStr, bind.Transact would fail at runtime.
func TestZkRollupABI_packsSubmitBatchWitness(t *testing.T) {
	parsed, err := abi.JSON(strings.NewReader(zkRollupABIStr))
	if err != nil {
		t.Fatalf("parse ABI: %v", err)
	}
	header := BatchHeader{BatchId: 0, TxCount: 1}
	pre := []zkAccountState{{
		Account:  zkTrader,
		BalanceA: big.NewInt(1000),
		BalanceB: big.NewInt(0),
		Nonce:    big.NewInt(0),
	}}
	swaps := []zkSwapOp{{Trader: zkTrader, AmountIn: big.NewInt(10), Nonce: big.NewInt(0)}}

	data, err := parsed.Pack("submitBatch", header, pre, swaps)
	if err != nil {
		t.Fatalf("pack submitBatch: %v", err)
	}
	if len(data) < 4 {
		t.Fatalf("expected non-empty calldata, got %d bytes", len(data))
	}
}

// ── hashBatchHeader ──────────────────────────────────────────────────────────

func TestHashBatchHeader_nonZero(t *testing.T) {
	h := BatchHeader{BatchId: 1, TxCount: 5, L2StartBlock: 10, L2EndBlock: 14}
	got := hashBatchHeader(h)
	if got == [32]byte{} {
		t.Error("expected non-zero hash")
	}
}

func TestHashBatchHeader_deterministic(t *testing.T) {
	h := BatchHeader{BatchId: 7, TxCount: 3}
	a := hashBatchHeader(h)
	b := hashBatchHeader(h)
	if a != b {
		t.Error("hashBatchHeader should be deterministic")
	}
}

func TestHashBatchHeader_batchIdDifferentiates(t *testing.T) {
	h0 := BatchHeader{BatchId: 0}
	h1 := BatchHeader{BatchId: 1}
	if hashBatchHeader(h0) == hashBatchHeader(h1) {
		t.Error("different batchId should produce different hashes")
	}
}

func TestHashBatchHeader_postStateRootDifferentiates(t *testing.T) {
	h := BatchHeader{BatchId: 0}
	a := hashBatchHeader(h)
	h.PostStateRoot[0] = 0xff
	b := hashBatchHeader(h)
	if a == b {
		t.Error("different postStateRoot should produce different hashes")
	}
}

// TestHashBatchHeader_encodingLength verifies the 256-byte buffer is fully
// populated: a header with all-zero fields should hash to a known non-zero value
// (keccak256 of 256 zero bytes is not the zero hash).
func TestHashBatchHeader_zeroHeaderNonZero(t *testing.T) {
	h := hashBatchHeader(BatchHeader{})
	if h == [32]byte{} {
		t.Error("keccak256 of 256 zero bytes should not be the zero hash")
	}
}

// ── zkLedger (honest canonical mirror) ───────────────────────────────────────

var zkTrader = common.HexToAddress("0x1111111111111111111111111111111111111111")
var zkTraderB = common.HexToAddress("0x2222222222222222222222222222222222222222")

// Cross-language parity: the same one-account scenario pinned in
// SwapEngines.t.sol and watcher/honest_test.go must produce the same root here,
// or the ZK witness would be rejected by the Solidity verifier for honest batches.
func TestZkLedger_root_matchesReferenceScenario(t *testing.T) {
	l := newZkLedger([]common.Address{zkTrader}, 1000)
	want := "ea057b0a0638c94375c460077254704b78263d17ea3eaad67a845af4953fabbf"
	got := common.Bytes2Hex(rootBytes(l))
	if got != want {
		t.Errorf("ledger root mismatch:\n got  %s\n want %s", got, want)
	}
}

func rootBytes(l *zkLedger) []byte {
	r := l.root()
	return r[:]
}

// An honest projected root differs from every invalid mode's projected root, so
// the on-chain verifier (which recomputes honest) rejects the invalid claims.
func TestZkLedger_invalidModesDivergeFromHonest(t *testing.T) {
	l := newZkLedger([]common.Address{zkTrader}, 1_000_000)
	swaps := []decodedSwap{{trader: zkTrader, amountIn: big.NewInt(10), nonce: big.NewInt(0)}}
	honest := l.projectedRoot(swaps, "honest")
	for _, mode := range []string{"obvious", "subtle", "buggy"} {
		if l.projectedRoot(swaps, mode) == honest {
			t.Errorf("mode %q must diverge from honest", mode)
		}
	}
}

// swapOut mirrors the four engines exactly (amountIn=10 => gross 1000).
func TestZkLedger_swapOut_perMode(t *testing.T) {
	in := big.NewInt(10)
	cases := map[string]int64{"honest": 997, "obvious": 1994, "subtle": 1000, "buggy": 990}
	for mode, want := range cases {
		if got := swapOut(in, mode).Int64(); got != want {
			t.Errorf("swapOut(10,%q)=%d want %d", mode, got, want)
		}
	}
}

// applyBatch(honest) advances state; projectedRoot must not mutate the ledger.
func TestZkLedger_projectedRoot_isPure(t *testing.T) {
	l := newZkLedger([]common.Address{zkTrader, zkTraderB}, 1_000_000)
	before := l.root()
	_ = l.projectedRoot([]decodedSwap{{zkTrader, big.NewInt(5), big.NewInt(0)}}, "honest")
	if l.root() != before {
		t.Error("projectedRoot must not mutate the ledger")
	}
	l.applyBatch([]decodedSwap{{zkTrader, big.NewInt(5), big.NewInt(0)}}, "honest")
	if l.root() == before {
		t.Error("applyBatch should advance the ledger root")
	}
}

// ── parseZkBatchSubmitted ────────────────────────────────────────────────────

func TestParseZkBatchSubmitted_nilReceipt(t *testing.T) {
	accepted, gas := parseZkBatchSubmitted(nil)
	if accepted || gas != 0 {
		t.Error("nil receipt should return false, 0 without panic")
	}
}

func TestParseZkBatchSubmitted_noMatchingLog(t *testing.T) {
	receipt := &types.Receipt{Logs: []*types.Log{}}
	accepted, gas := parseZkBatchSubmitted(receipt)
	if accepted || gas != 0 {
		t.Error("empty logs should return false, 0")
	}
}

func TestParseZkBatchSubmitted_parsesAcceptedAndGas(t *testing.T) {
	// Build a synthetic ZkBatchSubmitted log:
	// Data: headerHash(32) | postStateRoot(32) | txCount(32) | accepted(32) | gasUsed(32)
	data := make([]byte, 160)
	data[127] = 1                                                // accepted = true
	gasVal := big.NewInt(42_000)
	gasBytes := gasVal.Bytes()
	copy(data[128+32-len(gasBytes):160], gasBytes) // right-aligned in slot [128:160]

	receipt := &types.Receipt{
		Logs: []*types.Log{
			{
				Topics: []common.Hash{zkBatchSubmittedTopic},
				Data:   data,
			},
		},
	}
	accepted, gas := parseZkBatchSubmitted(receipt)
	if !accepted {
		t.Error("expected accepted=true")
	}
	if gas != 42_000 {
		t.Errorf("expected gas=42000, got %d", gas)
	}
}

func TestParseZkBatchSubmitted_parsesRejected(t *testing.T) {
	data := make([]byte, 160)
	data[127] = 0 // accepted = false

	receipt := &types.Receipt{
		Logs: []*types.Log{
			{
				Topics: []common.Hash{zkBatchSubmittedTopic},
				Data:   data,
			},
		},
	}
	accepted, _ := parseZkBatchSubmitted(receipt)
	if accepted {
		t.Error("expected accepted=false")
	}
}
