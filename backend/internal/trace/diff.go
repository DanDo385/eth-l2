package trace

import (
	"encoding/binary"
	"slices"

	"github.com/ethereum/go-ethereum/crypto"
)

// DivergenceResult captures the first step where honest and claimed executions diverge,
// plus full filtered tapes for the OpcodeRace frontend visualization.
type DivergenceResult struct {
	DivergenceIdx int            `json:"divergenceIdx"`
	Op            string         `json:"op"`
	Slot          string         `json:"slot,omitempty"`
	HonestVal     string         `json:"honestVal,omitempty"`
	ClaimedVal    string         `json:"claimedVal,omitempty"`
	HonestSteps   []FilteredStep `json:"honestSteps"`
	ClaimedSteps  []FilteredStep `json:"claimedSteps"`
	// Point is keccak256(stepIdx ‖ op ‖ slot ‖ honestVal ‖ claimedVal), committed on-chain.
	Point [32]byte `json:"-"`
}

// Diff walks two filtered trace tapes in lockstep and returns the first divergence.
// Returns nil when no divergence is found (traces are identical up to the shorter one).
func Diff(honestLogs, claimedLogs []StructLog) *DivergenceResult {
	hs := FilterEngine(honestLogs)
	cs := FilterEngine(claimedLogs)

	limit := min(len(hs), len(cs))
	for i := range limit {
		h, c := hs[i], cs[i]
		if stepsDiffer(h, c) {
			slot, hVal, cVal := storageDiff(h.Storage, c.Storage)
			res := &DivergenceResult{
				DivergenceIdx: i,
				Op:            h.Op,
				Slot:          slot,
				HonestVal:     hVal,
				ClaimedVal:    cVal,
				HonestSteps:   hs,
				ClaimedSteps:  cs,
			}
			res.Point = commitDivergence(i, h.Op, slot, hVal, cVal)
			return res
		}
	}
	return nil
}

func stepsDiffer(a, b FilteredStep) bool {
	if a.Op != b.Op {
		return true
	}
	// Compare top-4 stack items.
	if !slices.Equal(a.Stack4, b.Stack4) {
		return true
	}
	// Compare storage snapshots.
	if len(a.Storage) != len(b.Storage) {
		return true
	}
	for k, v := range a.Storage {
		if b.Storage[k] != v {
			return true
		}
	}
	return false
}

// storageDiff returns the first slot where a and b disagree.
func storageDiff(a, b map[string]string) (slot, aVal, bVal string) {
	for k, v := range a {
		if b[k] != v {
			return k, v, b[k]
		}
	}
	for k, v := range b {
		if a[k] != v {
			return k, a[k], v
		}
	}
	return "", "", ""
}

// commitDivergence computes keccak256(stepIdx ‖ op ‖ slot ‖ honestVal ‖ claimedVal).
// This 32-byte hash is stored in DisputeGameMock as the on-chain divergencePoint.
func commitDivergence(stepIdx int, op, slot, honestVal, claimedVal string) [32]byte {
	var buf []byte
	var idx [8]byte
	binary.BigEndian.PutUint64(idx[:], uint64(stepIdx))
	buf = append(buf, idx[:]...)
	buf = append(buf, []byte(op)...)
	buf = append(buf, []byte(slot)...)
	buf = append(buf, []byte(honestVal)...)
	buf = append(buf, []byte(claimedVal)...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
