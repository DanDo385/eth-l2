package sequencer

const (
	// OptimisticSuspicionDenominator gives an approximately 1/30 chance that an
	// optimistic batch posts a bad output root. Keep this rare enough that normal
	// runs mostly show honest challenge windows.
	OptimisticSuspicionDenominator uint64 = 30

	// ZKSuspicionDenominator gives an approximately 1/60 chance that a ZK batch
	// submits an invalid claimed root. ZK faults are intentionally half as common
	// as optimistic faults in the teaching simulation.
	ZKSuspicionDenominator uint64 = 60
)
