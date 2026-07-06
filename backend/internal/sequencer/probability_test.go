package sequencer

import "testing"

func TestSuspicionProbabilityConstants(t *testing.T) {
	if OptimisticSuspicionDenominator != 30 {
		t.Fatalf("OP suspicion denominator = %d, want 30", OptimisticSuspicionDenominator)
	}
	if ZKSuspicionDenominator != 60 {
		t.Fatalf("ZK suspicion denominator = %d, want 60", ZKSuspicionDenominator)
	}
	if ZKSuspicionDenominator != OptimisticSuspicionDenominator*2 {
		t.Fatalf("ZK faults should occur half as often as OP faults")
	}
}
