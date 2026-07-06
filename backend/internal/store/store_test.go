package store

import (
	"sync"
	"testing"

	"github.com/dando385/eth-l2/backend/internal/trace"
)

func makeBatch(id uint64) *BatchInfo {
	return &BatchInfo{
		BatchID:       id,
		EngineType:    "honest",
		PostStateRoot: "0xroot",
		L2StartBlock:  10,
		L2EndBlock:    12,
		TxCount:       3,
	}
}

func TestNew_empty(t *testing.T) {
	s := New()
	snap := s.Snapshot()
	if snap.Running {
		t.Error("new store should not be running")
	}
	if len(snap.Batches) != 0 {
		t.Errorf("expected 0 batches, got %d", len(snap.Batches))
	}
}

func TestAddBatch_and_GetBatch(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(1))
	b := s.GetBatch(1)
	if b == nil {
		t.Fatal("expected batch, got nil")
	}
	if b.BatchID != 1 {
		t.Errorf("expected BatchID=1, got %d", b.BatchID)
	}
}

func TestAddBatch_emptyWarmupStatus(t *testing.T) {
	s := New()
	b := makeBatch(0)
	b.TxCount = 0
	s.AddBatch(b)
	got := s.GetBatch(0)
	if got.Status != "empty_warmup" {
		t.Fatalf("empty batch status = %q, want empty_warmup", got.Status)
	}
}

func TestGetBatch_missing(t *testing.T) {
	s := New()
	if s.GetBatch(999) != nil {
		t.Error("expected nil for missing batch")
	}
}

func TestFlagBatch(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(2))
	s.FlagBatch(2)
	b := s.GetBatch(2)
	if !b.Flagged {
		t.Error("expected Flagged=true")
	}
}

func TestFlagBatch_noOp_on_missing(t *testing.T) {
	s := New()
	s.FlagBatch(99) // should not panic
}

func TestSetChallenged(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(3))
	s.SetChallenged(3)
	b := s.GetBatch(3)
	if !b.Challenged {
		t.Error("expected Challenged=true")
	}
}

func TestSetVerified_setsLifecycleStatus(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(8))
	s.SetVerified(8, &VerificationInfo{
		Result:  "verified_mismatch",
		CostWei: "20000000000000000",
		Reason:  "mismatch",
	})
	b := s.GetBatch(8)
	if b.Verification == nil {
		t.Fatal("expected verification info")
	}
	if b.Status != "verified_mismatch" {
		t.Fatalf("status = %q, want verified_mismatch", b.Status)
	}
	if !b.Flagged {
		t.Fatal("verified mismatch should mark batch flagged")
	}
}

func TestSetResolved(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(4))
	div := &DivInfo{
		DivergenceIdx: 2,
		Op:            "SSTORE",
		Slot:          "0xslot",
		HonestVal:     "100",
		ClaimedVal:    "200",
		HonestSteps:   []trace.FilteredStep{{Op: "SSTORE"}},
		ClaimedSteps:  []trace.FilteredStep{{Op: "SSTORE"}},
	}
	s.SetResolved(4, div)
	b := s.GetBatch(4)
	if !b.Resolved {
		t.Error("expected Resolved=true")
	}
	if !b.Challenged {
		t.Error("expected Challenged=true after SetResolved")
	}
	if b.Divergence == nil {
		t.Fatal("expected Divergence to be set")
	}
	if b.Divergence.ClaimedVal != "200" {
		t.Errorf("expected claimedVal=200, got %s", b.Divergence.ClaimedVal)
	}
}

func TestSetBondSettlement_persistsInSnapshot(t *testing.T) {
	s := New()
	s.AddBatch(makeBatch(9))
	s.SetBondSettlement(9, &BondSettlement{
		BatchID:    9,
		Outcome:    "challenge_failed",
		Winner:     "sequencer",
		PayoutWei:  "190000000000000000",
		BurnedWei:  "10000000000000000",
		SeqBondWei: "100000000000000000",
	})
	b := s.GetBatch(9)
	if b.BondSettlement == nil {
		t.Fatal("expected bond settlement")
	}
	if b.BondSettlement.Outcome != "challenge_failed" {
		t.Fatalf("outcome = %q, want challenge_failed", b.BondSettlement.Outcome)
	}
}

func TestSetResolved_noOp_on_missing(t *testing.T) {
	s := New()
	s.SetResolved(999, &DivInfo{}) // should not panic
}

func TestSetBlock(t *testing.T) {
	s := New()
	s.SetBlock("l1", 10)
	s.SetBlock("op-l2", 5)
	s.SetBlock("zk-l2", 7)
	snap := s.Snapshot()
	if snap.Blocks.L1 != 10 {
		t.Errorf("expected L1=10, got %d", snap.Blocks.L1)
	}
	if snap.Blocks.OpL2 != 5 {
		t.Errorf("expected OpL2=5, got %d", snap.Blocks.OpL2)
	}
	if snap.Blocks.ZkL2 != 7 {
		t.Errorf("expected ZkL2=7, got %d", snap.Blocks.ZkL2)
	}
}

func TestSetBlock_unknownChain_noOp(t *testing.T) {
	s := New()
	s.SetBlock("unknown-chain", 99) // should not panic
	snap := s.Snapshot()
	if snap.Blocks.L1 != 0 || snap.Blocks.OpL2 != 0 || snap.Blocks.ZkL2 != 0 {
		t.Error("unknown chain should not modify any block counter")
	}
}

func TestSetRunning(t *testing.T) {
	s := New()
	s.SetRunning(true)
	if !s.Snapshot().Running {
		t.Error("expected Running=true")
	}
	s.SetRunning(false)
	if s.Snapshot().Running {
		t.Error("expected Running=false")
	}
}

func TestSnapshot_containsAllBatches(t *testing.T) {
	s := New()
	for i := uint64(1); i <= 5; i++ {
		s.AddBatch(makeBatch(i))
	}
	snap := s.Snapshot()
	if len(snap.Batches) != 5 {
		t.Errorf("expected 5 batches in snapshot, got %d", len(snap.Batches))
	}
}

func TestConcurrentAccess(t *testing.T) {
	s := New()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(3)
		id := uint64(i)
		go func() { defer wg.Done(); s.AddBatch(makeBatch(id)) }()
		go func() { defer wg.Done(); s.GetBatch(id) }()
		go func() { defer wg.Done(); s.Snapshot() }()
	}
	wg.Wait()
}
