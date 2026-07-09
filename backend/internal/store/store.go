package store

import (
	"sync"

	"github.com/dando385/eth-l2/backend/internal/sourcemap"
	"github.com/dando385/eth-l2/backend/internal/trace"
	"github.com/ethereum/go-ethereum/common"
)

// SwapSummary is one swap included in a posted OP batch, for the lifecycle tracker UI.
type SwapSummary struct {
	L2Block     uint64 `json:"l2Block"`
	TxHash      string `json:"txHash"`
	TraderIndex int    `json:"traderIndex"` // 0 or 1 (Anvil indices 3–4)
	AmountIn    uint64 `json:"amountIn"`
	HonestOut   uint64 `json:"honestOut"`
	ClaimedOut  uint64 `json:"claimedOut"`
	GasUsed     uint64 `json:"gasUsed,omitempty"`
	// IsDivergent marks the swap the fraud proof isolates (first swap in batch).
	IsDivergent bool `json:"isDivergent"`
}

// BatchInfo holds everything the backend knows about one posted OP batch.
type BatchInfo struct {
	BatchID        uint64            `json:"batchId"`
	TxHashes       []common.Hash     `json:"-"` // used internally for trace replay
	Swaps          []SwapSummary     `json:"swaps,omitempty"`
	EngineType     string            `json:"engineType"`
	PostStateRoot  string            `json:"postStateRoot"`
	L2StartBlock   uint64            `json:"l2StartBlock"`
	L2EndBlock     uint64            `json:"l2EndBlock"`
	TxCount        int               `json:"txCount"`
	Flagged        bool              `json:"flagged"`
	PostedRoot     string            `json:"postedRoot,omitempty"`
	ExpectedRoot   string            `json:"expectedRoot,omitempty"`
	FlagReason     string            `json:"flagReason,omitempty"`
	Challenged     bool              `json:"challenged"`
	Resolved       bool              `json:"resolved"`
	Finalized      bool              `json:"finalized"`
	SubmittedAt    int64             `json:"submittedAt"` // unix seconds, for the challenge-window countdown
	Status         string            `json:"status,omitempty"`
	Verification   *VerificationInfo `json:"verification,omitempty"`
	DisputeStage   string            `json:"disputeStage,omitempty"`
	BondSettlement *BondSettlement   `json:"bondSettlement,omitempty"`
	Divergence     *DivInfo          `json:"divergence,omitempty"`
}

type VerificationInfo struct {
	Result       string `json:"result"` // "verified_valid" | "verified_mismatch"
	CostWei      string `json:"costWei"`
	PostedRoot   string `json:"postedRoot,omitempty"`
	ExpectedRoot string `json:"expectedRoot,omitempty"`
	Reason       string `json:"reason"`
}

type BondSettlement struct {
	BatchID     uint64 `json:"batchId"`
	Outcome     string `json:"outcome"`
	Winner      string `json:"winner"`
	SeqBondWei  string `json:"seqBondWei"`
	ChalBondWei string `json:"chalBondWei"`
	PayoutWei   string `json:"payoutWei"`
	BurnedWei   string `json:"burnedWei"`
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
	RawHonestLen  int                  `json:"rawHonestLen"`
	RawClaimedLen int                  `json:"rawClaimedLen"`
	// OnchainDivergenceStep is the swap-VM step the on-chain fraud proof isolated.
	OnchainDivergenceStep int `json:"onchainDivergenceStep"`
	// LyingSource / HonestSource point at the exact Solidity lines (WO-4): the
	// engine's deviating statement and the honest engine's equivalent.
	LyingSource  *sourcemap.SourceLoc `json:"lyingSource,omitempty"`
	HonestSource *sourcemap.SourceLoc `json:"honestSource,omitempty"`
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
	if b.Status == "" {
		if b.TxCount == 0 {
			b.Status = "empty_warmup"
		} else {
			b.Status = "challenge_window_open"
		}
	}
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
		b.Status = "suspicious"
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

func (s *Store) SetVerified(id uint64, info *VerificationInfo) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Verification = info
		if info != nil {
			b.Status = info.Result
			if info.Result == "verified_mismatch" {
				b.Flagged = true
			}
		}
	}
	s.mu.Unlock()
}

func (s *Store) SetChallenged(id uint64) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Challenged = true
		b.Status = "challenged"
		b.DisputeStage = "dispute_open"
	}
	s.mu.Unlock()
}

func (s *Store) SetDisputeStage(id uint64, stage string) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.DisputeStage = stage
		if stage != "" && !b.Resolved {
			b.Status = stage
		}
	}
	s.mu.Unlock()
}

func (s *Store) SetResolved(id uint64, div *DivInfo) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Flagged = true
		b.Challenged = true
		b.Resolved = true
		b.Finalized = true
		b.Status = "rejected"
		b.DisputeStage = "rejected"
		b.Divergence = div
	}
	s.mu.Unlock()
}

func (s *Store) SetFinalized(id uint64) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.Finalized = true
		if b.Status == "" || b.Status == "challenge_window_open" || b.Status == "verified_valid" {
			b.Status = "finalized"
		}
	}
	s.mu.Unlock()
}

func (s *Store) SetBondSettlement(id uint64, settlement *BondSettlement) {
	s.mu.Lock()
	if b := s.batches[id]; b != nil {
		b.BondSettlement = settlement
	}
	s.mu.Unlock()
}

// UnfinalizedUnchallenged returns batch IDs that are honest (not flagged), not
// challenged, not yet finalized, and older than minAgeSeconds. Used by the
// session finalizer to return sequencer bonds after the challenge window.
func (s *Store) UnfinalizedUnchallenged(nowUnix, minAgeSeconds int64) []uint64 {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var out []uint64
	for id, b := range s.batches {
		if !b.Finalized && !b.Challenged && !b.Flagged && b.SubmittedAt > 0 &&
			nowUnix-b.SubmittedAt >= minAgeSeconds {
			out = append(out, id)
		}
	}
	return out
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
