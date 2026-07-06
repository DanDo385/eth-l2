package challenge

import (
	"math/big"

	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

// This file mirrors contracts/l1/SwapStepVM.sol and contracts/shared/Merkle.sol
// in Go, so the challenger can build the execution traces, Merkle roots, and
// proofs the on-chain FraudProofGame expects. The leaf/hash and Merkle encodings
// are pinned against Solidity reference values in fraudproof_test.go; if either
// side drifts, the pins fail.

const (
	vmRATE  = 100
	vmFEE   = 30
	vmDENOM = 10000

	opHALT = 0
	opADD  = 1
	opSUB  = 2
	opMUL  = 3
	opDIV  = 4

	vmTraceLen = 8 // states M0..M7
)

// vmState mirrors SwapStepVM.State: pc + an 8-word register file.
type vmState struct {
	pc uint64
	w  [8]*big.Int
}

func (s vmState) clone() vmState {
	var ns vmState
	ns.pc = s.pc
	for i := range s.w {
		ns.w[i] = new(big.Int).Set(s.w[i])
	}
	return ns
}

func vmInitial(amountIn int64) vmState {
	var s vmState
	for i := range s.w {
		s.w[i] = big.NewInt(0)
	}
	s.w[0] = big.NewInt(amountIn)
	s.w[1] = big.NewInt(vmRATE)
	s.w[2] = big.NewInt(vmDENOM)
	s.w[3] = big.NewInt(vmFEE)
	// w[4] = balanceB_pre = 0 (the divergence is always before the ADD at step 4,
	// so the starting balance does not affect the verdict).
	return s
}

func vmProgram(pc uint64) (op, dst, src1, src2 int) {
	switch pc {
	case 0:
		return opMUL, 5, 0, 1
	case 1:
		return opSUB, 6, 2, 3
	case 2:
		return opMUL, 7, 5, 6
	case 3:
		return opDIV, 7, 7, 2
	case 4:
		return opADD, 4, 4, 7
	default:
		return opHALT, 0, 0, 0
	}
}

func vmStep(s vmState) vmState {
	ns := s.clone()
	op, dst, src1, src2 := vmProgram(s.pc)
	if op == opHALT {
		ns.pc = s.pc + 1
		return ns
	}
	a, b := s.w[src1], s.w[src2]
	res := new(big.Int)
	switch op {
	case opADD:
		res.Add(a, b)
	case opSUB:
		res.Sub(a, b)
	case opMUL:
		res.Mul(a, b)
	case opDIV:
		if b.Sign() == 0 {
			res.SetInt64(0)
		} else {
			res.Div(a, b)
		}
	}
	ns.w[dst] = res
	ns.pc = s.pc + 1
	return ns
}

// vmHash mirrors SwapStepVM.hashState: keccak256(abi.encode(pc, w[8])).
func vmHash(s vmState) [32]byte {
	buf := make([]byte, 0, 32*9)
	buf = append(buf, leftPad32(new(big.Int).SetUint64(s.pc))...)
	for i := 0; i < 8; i++ {
		buf = append(buf, leftPad32(s.w[i])...)
	}
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

// honestTrace returns the 8 machine states of a correct swap.
func honestTrace(amountIn int64) []vmState {
	states := make([]vmState, vmTraceLen)
	s := vmInitial(amountIn)
	states[0] = s
	for k := 0; k < vmTraceLen-1; k++ {
		s = vmStep(s)
		states[k+1] = s
	}
	return states
}

// fraudParams maps an engine type to the single step whose output the lying/buggy
// sequencer got wrong, mirroring the L2 engines.
func fraudParams(amountIn int64, engineType string) (badStep uint64, badDst int, badValue *big.Int, ok bool) {
	gross := amountIn * vmRATE
	honestOut := gross * (vmDENOM - vmFEE) / vmDENOM
	switch engineType {
	case "obvious": // doubled output at the DIV (step 3, dst w7)
		return 3, 7, big.NewInt(honestOut * 2), true
	case "subtle": // skipped fee: the SUB (step 1, dst w6) claims 10000 instead of 9970
		return 1, 6, big.NewInt(vmDENOM), true
	case "buggy": // early-division truncation: DIV (step 3) claims amountIn*99
		perUnit := int64(vmRATE * (vmDENOM - vmFEE) / vmDENOM)
		return 3, 7, big.NewInt(amountIn * perUnit), true
	default:
		return 0, 0, nil, false
	}
}

// lyingTrace builds the sequencer's trace: honest up to badStep, the output of
// badStep corrupted to badValue, then honest steps continue from the corruption.
func lyingTrace(honest []vmState, badStep uint64, badDst int, badValue *big.Int) []vmState {
	ls := make([]vmState, vmTraceLen)
	for i := uint64(0); i <= badStep; i++ {
		ls[i] = honest[i].clone()
	}
	ns := vmStep(ls[badStep])
	ns.w[badDst] = new(big.Int).Set(badValue)
	ls[badStep+1] = ns
	for i := badStep + 1; i < vmTraceLen-1; i++ {
		ls[i+1] = vmStep(ls[i])
	}
	return ls
}

func leavesOf(states []vmState) [][32]byte {
	out := make([][32]byte, len(states))
	for i, s := range states {
		out[i] = vmHash(s)
	}
	return out
}

// ── Merkle (mirrors contracts/shared/Merkle.sol) ─────────────────────────────

func keccakPair(l, r [32]byte) [32]byte {
	var out [32]byte
	copy(out[:], crypto.Keccak256(l[:], r[:]))
	return out
}

func merkleRoot(leaves [][32]byte) [32]byte {
	level := append([][32]byte(nil), leaves...)
	n := len(level)
	for n > 1 {
		half := (n + 1) / 2
		for i := 0; i < half; i++ {
			j := i * 2
			left := level[j]
			right := left
			if j+1 < n {
				right = level[j+1]
			}
			level[i] = keccakPair(left, right)
		}
		n = half
	}
	return level[0]
}

// merkleProof returns the sibling path for index, matching Merkle.verify's
// index-parity pairing.
func merkleProof(leaves [][32]byte, index int) [][32]byte {
	var proof [][32]byte
	level := append([][32]byte(nil), leaves...)
	n := len(level)
	idx := index
	for n > 1 {
		sib := idx ^ 1
		if sib < n {
			proof = append(proof, level[sib])
		} else {
			proof = append(proof, level[idx]) // duplicated last node
		}
		half := (n + 1) / 2
		next := make([][32]byte, half)
		for i := 0; i < half; i++ {
			j := i * 2
			left := level[j]
			right := left
			if j+1 < n {
				right = level[j+1]
			}
			next[i] = keccakPair(left, right)
		}
		level = next
		n = half
		idx /= 2
	}
	return proof
}

func leftPad32(n *big.Int) []byte {
	out := make([]byte, 32)
	if n == nil {
		return out
	}
	b := n.Bytes()
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	copy(out[32-len(b):], b)
	return out
}

// abiState mirrors SwapStepVM.State for ABI packing in resolveOneStep.
type abiState struct {
	Pc *big.Int
	W  [8]*big.Int
}

func toABIState(s vmState) abiState {
	var w [8]*big.Int
	for i := range s.w {
		w[i] = new(big.Int).Set(s.w[i])
	}
	return abiState{Pc: new(big.Int).SetUint64(s.pc), W: w}
}

// abiInitParams mirrors FraudProofGame.InitParams for ABI packing.
type abiInitParams struct {
	BatchId       uint64
	Challenger    common.Address
	Sequencer     common.Address
	SeqRoot       [32]byte
	ChalRoot      [32]byte
	TraceLen      uint64
	M0Hash        [32]byte
	M0SeqProof    [][32]byte
	M0ChalProof   [][32]byte
	SeqLastHash   [32]byte
	ChalLastHash  [32]byte
	LastSeqProof  [][32]byte
	LastChalProof [][32]byte
}
