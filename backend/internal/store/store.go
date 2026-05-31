package store

import (
	"sync"

	"github.com/dando385/eth-l2/backend/internal/trace"
	"github.com/ethereum/go-ethereum/common"
)

// BatchInfo holds everything the backend knows about one posted OP batch.
type BatchInfo struct {
	BatchID       uint64        `json:"batchId"`
	TxHashes      []common.Hash `json:"-"` // used internally for trace replay
	EngineType    string        `json:"engineType"`
	PostStateRoot string        `json:"postStateRoot"`
	L2StartBlock  uint64        `json:"l2StartBlock"`
	L2EndBlock    uint64        `json:"l2EndBlock"`
	TxCount       int           `json:"txCount"`
	Flagged       bool          `json:"flagged"`
	PostedRoot    string        `json:"postedRoot,omitempty"`
	ExpectedRoot  string        `json:"expectedRoot,omitempty"`
	FlagReason    string        `json:"flagReason,omitempty"`
	Challenged    bool          `json:"challenged"`
	Resolved      bool          `json:"resolved"`
	Divergence    *DivInfo      `json:"divergence,omitempty"`
}

// DivInfo is the serialisable subset of trace.DivergenceResult for /api/batch/:id and WS events.
type DivInfo struct {
	DivergenceIdx int                  `json:"divergenceIdx"`
	Op            string               `json:"op"`
	Slot          string               `json:"slot"`
	HonestVal     string               `json:"honestVal"`
	ClaimedVal    string               `json:"claimedVal"`
	HonestSteps   []trace.FilteredStep `json:"honestSteps"`
	ClaimedSteps  []trace.FilteredStep `json:"claimedSteps"`
}

// BlockNums tracks the latest seen block per chain name.
type BlockNums struct {
	L1   uint64 `json:"l1"`
	OpL2 uint64 `json:"opL2"`
	ZkL2 uint64 `json:"zkL2"`
}

// Store is the in-memory state store shared by sequencer, watcher, challenger, and server.
type Store struct {
	mu      sync.RWMutex
	batches map[uint64]*BatchInfo
	blocks  BlockNums
	running bool
	paused  bool
}

func New() *Store {
	return &Store{batches: make(map[uint64]*BatchInfo)}
}

func (s *Store) SetRunning(v bool) {
	s.SetSessionState(v, false)
}

func (s *Store) SetSessionState(active, paused bool) {
	s.mu.Lock()
	s.running = active
	if active {
		s.paused = paused
	} else {
		s.paused = false
	}
	s.mu.Unlock()
}

func (s *Store) SetBlock(chain string, num uint64) {
	s.mu.Lock()
	switch chain {
	case "l1":
		s.blocks.L1 = num
	case "op-l2":
		s.blocks.OpL2 = num
	case "zk-l2":
		s.blocks.ZkL2 = num
	}
	s.mu.Unlock()
}

func (s *Store) AddBatch(b *BatchInfo) {
	s.mu.Lock()
	s.batches[b.BatchID] = b
	s.mu.Unlock()
}

func (s *Store) GetBatch(id uint64) *BatchInfo {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.batches[id]
}

func (s *Store) FlagBatch(id uint64) {
	s.FlagBatchWithRoots(id, "", "", "")
}

// FlagBatchWithRoots marks a batch suspicious and records the root mismatch for the UI.
func (s *Store) FlagBatchWithRoots(id uint64, postedRoot, expectedRoot, reason string) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Flagged = true
		if postedRoot != "" {
			b.PostedRoot = postedRoot
		}
		if expectedRoot != "" {
			b.ExpectedRoot = expectedRoot
		}
		if reason != "" {
			b.FlagReason = reason
		}
	}
	s.mu.Unlock()
}

func (s *Store) SetChallenged(id uint64) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Challenged = true
	}
	s.mu.Unlock()
}

func (s *Store) SetResolved(id uint64, div *DivInfo) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Flagged = true
		b.Challenged = true
		b.Resolved = true
		b.Divergence = div
	}
	s.mu.Unlock()
}

// Snapshot returns a JSON-safe copy of the full state.
func (s *Store) Snapshot() StateSnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()
	snap := StateSnapshot{
		Running: s.running,
		Paused:  s.paused,
		Blocks:  s.blocks,
		Batches: make([]*BatchInfo, 0, len(s.batches)),
	}
	for _, b := range s.batches {
		snap.Batches = append(snap.Batches, b)
	}
	return snap
}

// StateSnapshot is what GET /api/state returns.
type StateSnapshot struct {
	Running bool         `json:"running"`
	Paused  bool         `json:"paused"`
	Blocks  BlockNums    `json:"blocks"`
	Batches []*BatchInfo `json:"batches"`
}
