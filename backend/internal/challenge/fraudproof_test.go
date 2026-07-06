package challenge

import (
	"math/big"
	"strings"
	"testing"

	abipkg "github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
)

// Pins against the literals emitted by test/FraudProofGame.t.sol
// (test_log_referenceValues). If the Go step-VM or Merkle encoding drifts from
// the Solidity SwapStepVM / Merkle, these fail.
const (
	refM0Hash     = "d76ba8e7c7b9b8d2aacd009e8eea53f5f1c72f9b8958391950f4c9321c06dff5"
	refHonestRoot = "9f6a6cad37d466b1307699be0740e93e05e4c056a7b2ab106dad9a75937f80d1"
	refLeaf3      = "4fd8856dff99ecbd15538cc9f52ad49e731569f352de7e2701d935fbc913775b"
	refProof3_0   = "ac7877d1fc4f190900833642c11c6f6bd664e0ae582555a50b3f7fca56b84d5a"
)

func TestVM_initialStateHash_matchesSolidity(t *testing.T) {
	got := common.Bytes2Hex(hashBytes(vmHash(vmInitial(10))))
	if got != refM0Hash {
		t.Errorf("m0 hash mismatch:\n got  %s\n want %s", got, refM0Hash)
	}
}

func TestVM_honestRootAndLeaf_matchSolidity(t *testing.T) {
	leaves := leavesOf(honestTrace(10))
	if got := common.Bytes2Hex(hashBytes(leaves[3])); got != refLeaf3 {
		t.Errorf("leaf3 mismatch:\n got  %s\n want %s", got, refLeaf3)
	}
	if got := common.Bytes2Hex(hashBytes(merkleRoot(leaves))); got != refHonestRoot {
		t.Errorf("root mismatch:\n got  %s\n want %s", got, refHonestRoot)
	}
	if got := common.Bytes2Hex(hashBytes(merkleProof(leaves, 3)[0])); got != refProof3_0 {
		t.Errorf("proof3[0] mismatch:\n got  %s\n want %s", got, refProof3_0)
	}
}

func hashBytes(h [32]byte) []byte { return h[:] }

// honest amountOut for amountIn=10 is 997 in register w7 after step 3.
func TestVM_honestTrace_computesAmountOut(t *testing.T) {
	states := honestTrace(10)
	if got := states[4].w[7].Int64(); got != 997 {
		t.Errorf("expected amountOut=997 at M4, got %d", got)
	}
}

// The lying trace diverges from honest at exactly the step the engine got wrong.
func TestVM_lyingTrace_divergesAtBadStep(t *testing.T) {
	cases := map[string]uint64{"obvious": 3, "subtle": 1, "buggy": 3}
	honest := honestTrace(10)
	honestLeaves := leavesOf(honest)
	for engine, wantStep := range cases {
		badStep, badDst, badValue, ok := fraudParams(10, engine)
		if !ok {
			t.Fatalf("%s should be fraudulent", engine)
		}
		if badStep != wantStep {
			t.Errorf("%s badStep=%d want %d", engine, badStep, wantStep)
		}
		lying := leavesOf(lyingTrace(honest, badStep, badDst, badValue))
		// first differing leaf index = badStep+1
		firstDiff := -1
		for i := 0; i < vmTraceLen; i++ {
			if lying[i] != honestLeaves[i] {
				firstDiff = i
				break
			}
		}
		if firstDiff != int(wantStep)+1 {
			t.Errorf("%s first divergence at leaf %d, want %d", engine, firstDiff, wantStep+1)
		}
	}
}

func TestVM_honestEngine_notFraud(t *testing.T) {
	if _, _, _, ok := fraudParams(10, "honest"); ok {
		t.Error("honest engine should not be fraudulent")
	}
	_ = big.NewInt(0)
}

// Guards the struct<->tuple mapping challenge.go relies on at runtime: if a
// field name/type drifts from the FraudProofGame ABI, bind.Transact fails.
func TestFraudGameABI_packsInitiateAndResolve(t *testing.T) {
	parsed, err := abiJSON(disputeGameABIStr)
	if err != nil {
		t.Fatalf("parse ABI: %v", err)
	}
	honest := honestTrace(10)
	leaves := leavesOf(honest)
	p := abiInitParams{
		BatchId: 0, TraceLen: vmTraceLen,
		SeqRoot: merkleRoot(leaves), ChalRoot: merkleRoot(leaves),
		M0Hash: leaves[0], M0SeqProof: merkleProof(leaves, 0), M0ChalProof: merkleProof(leaves, 0),
		SeqLastHash: leaves[7], ChalLastHash: leaves[7],
		LastSeqProof: merkleProof(leaves, 7), LastChalProof: merkleProof(leaves, 7),
	}
	if _, err := parsed.Pack("initiate", p); err != nil {
		t.Fatalf("pack initiate: %v", err)
	}
	if _, err := parsed.Pack("bisect", uint64(0), leaves[3], merkleProof(leaves, 3), leaves[3], merkleProof(leaves, 3)); err != nil {
		t.Fatalf("pack bisect: %v", err)
	}
	if _, err := parsed.Pack("resolveOneStep", uint64(0), toABIState(honest[3])); err != nil {
		t.Fatalf("pack resolveOneStep: %v", err)
	}
}

func abiJSON(s string) (abipkg.ABI, error) { return abipkg.JSON(strings.NewReader(s)) }
