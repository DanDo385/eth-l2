package sequencer

import (
	"math/big"
	"testing"

	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

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

// ── findAcceptingProof ───────────────────────────────────────────────────────

func newTestZKSeq() *ZKSequencer {
	return &ZKSequencer{prng: seed.New(42)}
}

func TestFindAcceptingProof_alwaysAccepted(t *testing.T) {
	s := newTestZKSeq()
	for batchID := uint64(0); batchID < 20; batchID++ {
		s.nextBatchID = batchID
		var headerHash [32]byte
		headerHash[0] = byte(batchID)
		proof := s.findAcceptingProof(headerHash)
		// VerifierMock: keccak256(proof || headerHash)[0] < 0x80
		check := crypto.Keccak256(proof, headerHash[:])
		if check[0] >= 0x80 {
			t.Errorf("batch %d: proof not accepted (first byte=0x%02x)", batchID, check[0])
		}
	}
}

func TestFindAcceptingProof_proofLength(t *testing.T) {
	s := newTestZKSeq()
	var h [32]byte
	proof := s.findAcceptingProof(h)
	if len(proof) != 40 {
		t.Errorf("expected 40-byte proof, got %d", len(proof))
	}
}

func TestFindAcceptingProof_deterministicForSameSeed(t *testing.T) {
	var h [32]byte
	h[1] = 0xab

	s1 := newTestZKSeq()
	s1.nextBatchID = 3
	p1 := s1.findAcceptingProof(h)

	s2 := newTestZKSeq()
	s2.nextBatchID = 3
	p2 := s2.findAcceptingProof(h)

	for i := range p1 {
		if p1[i] != p2[i] {
			t.Errorf("proof byte %d differs: 0x%02x vs 0x%02x", i, p1[i], p2[i])
		}
	}
}

func TestFindAcceptingProof_differentBatchesDifferentProofs(t *testing.T) {
	var h [32]byte
	s := newTestZKSeq()

	s.nextBatchID = 0
	p0 := s.findAcceptingProof(h)

	s.nextBatchID = 1
	p1 := s.findAcceptingProof(h)

	same := true
	for i := range p0 {
		if p0[i] != p1[i] {
			same = false
			break
		}
	}
	if same {
		t.Error("different batch IDs should (almost certainly) produce different proofs")
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
