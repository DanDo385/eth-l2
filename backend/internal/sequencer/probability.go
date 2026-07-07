package sequencer

const (
	// OptimisticSuspicionDenominator gives an approximately 1/8 chance that an
	// optimistic batch posts a bad output root. At the default demo cadence this
	// yields about 1-2 challenges in 60s and 3-4 in 120s.
	OptimisticSuspicionDenominator uint64 = 8

	// ZKSuspicionDenominator gives an approximately 1/16 chance that a ZK batch
	// submits an invalid claimed root. ZK faults are intentionally half as common
	// as optimistic faults in the teaching simulation.
	ZKSuspicionDenominator uint64 = 16
)
