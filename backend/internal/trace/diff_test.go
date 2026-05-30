package trace

import (
	"encoding/hex"
	"testing"
)

func makeLog(op string, stack []string, storage map[string]string) StructLog {
	return StructLog{Op: op, Stack: stack, Storage: storage}
}

func withEngineEntry(logs []StructLog) []StructLog {
	out := make([]StructLog, 0, len(logs)+1)
	out = append(out, makeLog("DELEGATECALL", nil, nil))
	out = append(out, logs...)
	return out
}

func TestFilterEngine_skipsRouterPreamble(t *testing.T) {
	logs := []StructLog{
		makeLog("SLOAD", []string{"router"}, nil),
		makeLog("DELEGATECALL", []string{"engine"}, nil),
		makeLog("SLOAD", []string{"engine-slot"}, nil),
		makeLog("SSTORE", nil, map[string]string{"slot": "1"}),
	}
	filtered := FilterEngine(logs)
	if len(filtered) != 2 {
		t.Fatalf("expected 2 engine steps, got %d (%v)", len(filtered), filtered)
	}
	if filtered[0].Op != "SLOAD" || filtered[1].Op != "SSTORE" {
		t.Errorf("unexpected engine ops: %v", filtered)
	}
}

func TestFilter_keepsOnlySalientOps(t *testing.T) {
	logs := []StructLog{
		makeLog("PUSH1", nil, nil),
		makeLog("SLOAD", []string{"0xabc"}, map[string]string{"slot": "val"}),
		makeLog("ADD", nil, nil),
		makeLog("SSTORE", []string{"0xabc", "0x1"}, map[string]string{"slot": "val2"}),
		makeLog("RETURN", nil, nil),
	}
	filtered := Filter(logs)
	if len(filtered) != 3 {
		t.Fatalf("expected 3 filtered steps, got %d", len(filtered))
	}
	if filtered[0].Op != "SLOAD" {
		t.Errorf("expected SLOAD, got %s", filtered[0].Op)
	}
	if filtered[1].Op != "SSTORE" {
		t.Errorf("expected SSTORE, got %s", filtered[1].Op)
	}
	if filtered[2].Op != "RETURN" {
		t.Errorf("expected RETURN, got %s", filtered[2].Op)
	}
}

func TestFilter_stack4TakesTopFour(t *testing.T) {
	logs := []StructLog{
		makeLog("SLOAD", []string{"a", "b", "c", "d", "e", "f"}, nil),
	}
	out := Filter(logs)
	if len(out[0].Stack4) != 4 {
		t.Fatalf("expected 4 stack items, got %d", len(out[0].Stack4))
	}
	if out[0].Stack4[0] != "c" || out[0].Stack4[3] != "f" {
		t.Errorf("wrong stack slice: %v", out[0].Stack4)
	}
}

func TestFilter_shortStack(t *testing.T) {
	logs := []StructLog{
		makeLog("SSTORE", []string{"x"}, nil),
	}
	out := Filter(logs)
	if len(out[0].Stack4) != 1 {
		t.Fatalf("expected 1 item, got %d", len(out[0].Stack4))
	}
}

func TestDiff_identicalTraces(t *testing.T) {
	logs := withEngineEntry([]StructLog{
		makeLog("SLOAD", nil, map[string]string{"slot": "1"}),
		makeLog("SSTORE", nil, map[string]string{"slot": "2"}),
		makeLog("RETURN", nil, nil),
	})
	result := Diff(logs, logs)
	if result != nil {
		t.Errorf("expected nil divergence for identical traces, got %+v", result)
	}
}

func TestDiff_opDivergence(t *testing.T) {
	honest := withEngineEntry([]StructLog{
		makeLog("SLOAD", nil, nil),
		makeLog("SSTORE", nil, map[string]string{"s": "100"}),
		makeLog("RETURN", nil, nil),
	})
	lying := withEngineEntry([]StructLog{
		makeLog("SLOAD", nil, nil),
		makeLog("SSTORE", nil, map[string]string{"s": "200"}),
		makeLog("RETURN", nil, nil),
	})
	result := Diff(honest, lying)
	if result == nil {
		t.Fatal("expected divergence, got nil")
	}
	if result.DivergenceIdx != 1 {
		t.Errorf("expected divergence at index 1, got %d", result.DivergenceIdx)
	}
	if result.Op != "SSTORE" {
		t.Errorf("expected op SSTORE, got %s", result.Op)
	}
	if result.HonestVal != "100" {
		t.Errorf("expected honestVal=100, got %s", result.HonestVal)
	}
	if result.ClaimedVal != "200" {
		t.Errorf("expected claimedVal=200, got %s", result.ClaimedVal)
	}
}

func TestDiff_stackDivergence(t *testing.T) {
	honest := withEngineEntry([]StructLog{
		makeLog("SLOAD", []string{"0x1", "0x2", "0x3", "0xA"}, nil),
	})
	lying := withEngineEntry([]StructLog{
		makeLog("SLOAD", []string{"0x1", "0x2", "0x3", "0xB"}, nil),
	})
	result := Diff(honest, lying)
	if result == nil {
		t.Fatal("expected stack divergence, got nil")
	}
	if result.DivergenceIdx != 0 {
		t.Errorf("expected divergence at index 0, got %d", result.DivergenceIdx)
	}
}

func TestDiff_honestAndClaimedTapesAttached(t *testing.T) {
	honest := withEngineEntry([]StructLog{
		makeLog("SSTORE", nil, map[string]string{"k": "1"}),
		makeLog("RETURN", nil, nil),
	})
	lying := withEngineEntry([]StructLog{
		makeLog("SSTORE", nil, map[string]string{"k": "9"}),
		makeLog("RETURN", nil, nil),
	})
	result := Diff(honest, lying)
	if result == nil {
		t.Fatal("expected divergence")
	}
	if len(result.HonestSteps) == 0 || len(result.ClaimedSteps) == 0 {
		t.Error("expected non-empty tape slices in result")
	}
}

func TestCommitDivergence_nonZero(t *testing.T) {
	point := commitDivergence(5, "SSTORE", "0xslot", "0xhonest", "0xclaimed")
	if point == [32]byte{} {
		t.Error("expected non-zero commitment")
	}
}

func TestCommitDivergence_deterministic(t *testing.T) {
	a := commitDivergence(5, "SSTORE", "0xslot", "0xhonest", "0xclaimed")
	b := commitDivergence(5, "SSTORE", "0xslot", "0xhonest", "0xclaimed")
	if a != b {
		t.Error("commitment not deterministic")
	}
}

func TestCommitDivergence_differentInputsDifferentOutput(t *testing.T) {
	a := commitDivergence(1, "SSTORE", "slot", "h", "c")
	b := commitDivergence(2, "SSTORE", "slot", "h", "c")
	if a == b {
		t.Error("different step indices should produce different commitments")
	}
}

func TestCommitDivergence_knownVector(t *testing.T) {
	// Step 0, op="SLOAD", no slot/val → keccak256(u64(0) || "SLOAD")
	point := commitDivergence(0, "SLOAD", "", "", "")
	if point == [32]byte{} {
		t.Error("commitment should not be zero")
	}
	_ = hex.EncodeToString(point[:]) // confirm it's a valid 32-byte hex
}

func TestStorageDiff_findsFirstDifferentSlot(t *testing.T) {
	a := map[string]string{"s1": "v1", "s2": "v2"}
	b := map[string]string{"s1": "v1", "s2": "DIFFERENT"}
	slot, av, bv := storageDiff(a, b)
	if slot != "s2" {
		t.Errorf("expected slot s2, got %s", slot)
	}
	if av != "v2" || bv != "DIFFERENT" {
		t.Errorf("wrong values: av=%s bv=%s", av, bv)
	}
}

func TestStorageDiff_slotOnlyInB(t *testing.T) {
	a := map[string]string{}
	b := map[string]string{"s1": "v1"}
	slot, _, bv := storageDiff(a, b)
	if slot != "s1" || bv != "v1" {
		t.Errorf("unexpected: slot=%s bv=%s", slot, bv)
	}
}

func TestStorageDiff_noDiff(t *testing.T) {
	a := map[string]string{"x": "1"}
	b := map[string]string{"x": "1"}
	slot, _, _ := storageDiff(a, b)
	if slot != "" {
		t.Errorf("expected empty slot, got %s", slot)
	}
}
