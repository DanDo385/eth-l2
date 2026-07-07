package sequencer

import "testing"

func TestSuspicionProbabilityConstants(t *testing.T) {
	if OptimisticSuspicionDenominator != 8 {
		t.Fatalf("OP suspicion denominator = %d, want 8", OptimisticSuspicionDenominator)
	}
	if ZKSuspicionDenominator != 16 {
		t.Fatalf("ZK suspicion denominator = %d, want 16", ZKSuspicionDenominator)
	}
	if ZKSuspicionDenominator != OptimisticSuspicionDenominator*2 {
		t.Fatalf("ZK faults should occur half as often as OP faults")
	}
}
