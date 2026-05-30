package trace

// salientOps is the set of opcodes the demo cares about.
// Raw traces contain hundreds of arithmetic/control ops; these are the only ones
// that show state reads, writes, cross-contract calls, or terminal outcomes.
// Without this filter, compilation-artifact JUMP differences cause false positives
// at step ~50 before the real fraud (SSTORE) appears at step ~255.
var salientOps = map[string]bool{
	"SLOAD": true, "SSTORE": true,
	"CALL": true, "CALLCODE": true, "STATICCALL": true, "DELEGATECALL": true,
	"RETURN": true, "REVERT": true, "STOP": true,
	"LOG0": true, "LOG1": true, "LOG2": true, "LOG3": true, "LOG4": true,
}

// FilteredStep is one salient step ready for the diff and the frontend OpcodeRace tape.
type FilteredStep struct {
	Op      string            `json:"op"`
	Stack4  []string          `json:"stack4"`  // top 4 stack items (last element = top)
	Storage map[string]string `json:"storage"` // only populated for SLOAD/SSTORE
	PC      uint64            `json:"pc"`
}

// Filter reduces a raw struct-log sequence to only the salient ops.
func Filter(logs []StructLog) []FilteredStep {
	return filterSalient(logs, false)
}

// FilterEngine keeps salient ops inside the swap engine (after the router DELEGATECALL).
// Router-level reads/calls differ between honest replay and the mined tx; skipping them
// aligns tapes so fraud shows up at the SSTORE (or similar) inside the engine.
func FilterEngine(logs []StructLog) []FilteredStep {
	return filterSalient(logs, true)
}

func filterSalient(logs []StructLog, engineOnly bool) []FilteredStep {
	out := make([]FilteredStep, 0, len(logs)/10)
	inEngine := !engineOnly
	for _, l := range logs {
		if engineOnly && !inEngine {
			if l.Op == "DELEGATECALL" {
				inEngine = true
			}
			continue
		}
		if !salientOps[l.Op] {
			continue
		}
		step := FilteredStep{
			Op:      l.Op,
			PC:      l.PC,
			Storage: l.Storage,
		}
		if n := len(l.Stack); n > 0 {
			start := n - 4
			if start < 0 {
				start = 0
			}
			step.Stack4 = l.Stack[start:]
		}
		out = append(out, step)
	}
	return out
}
