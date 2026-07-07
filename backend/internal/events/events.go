package events

import (
	"encoding/json"
	"sync"
)

type Type string

const (
	BlockMined      Type = "block_mined"
	BatchPosted     Type = "batch_posted"
	BatchFlagged    Type = "batch_flagged"
	BatchVerified   Type = "batch_verified"
	BatchChallenged Type = "batch_challenged"
	DisputeStage    Type = "dispute_stage"
	DisputeResolved Type = "dispute_resolved"
	BondSettled     Type = "bond_settled"
	ZkInspectReady  Type = "zk_inspect_ready"
	SessionChanged  Type = "session_state_changed"
	ErrorOccurred   Type = "error_occurred"
)

type Event struct {
	Type    Type            `json:"type"`
	Payload json.RawMessage `json:"payload"`
}

// New marshals payload and returns a ready-to-publish event.
func New(t Type, payload any) Event {
	b, _ := json.Marshal(payload)
	return Event{Type: t, Payload: b}
}

// --- Payload types ---

type BlockMinedPayload struct {
	Chain    string `json:"chain"`
	BlockNum uint64 `json:"blockNum"`
}

type BatchPostedPayload struct {
	BatchID       uint64        `json:"batchId"`
	PostStateRoot string        `json:"postStateRoot"` // hex
	L2StartBlock  uint64        `json:"l2StartBlock"`
	L2EndBlock    uint64        `json:"l2EndBlock"`
	TxCount       int           `json:"txCount"`
	EngineType    string        `json:"engineType"` // "honest" | "obvious" | "subtle"
	Swaps         []SwapSummary `json:"swaps,omitempty"`
}

// SwapSummary is one swap in a posted batch (lifecycle tracker UI).
type SwapSummary struct {
	L2Block     uint64 `json:"l2Block"`
	TxHash      string `json:"txHash"`
	TraderIndex int    `json:"traderIndex"`
	AmountIn    uint64 `json:"amountIn"`
	HonestOut   uint64 `json:"honestOut"`
	ClaimedOut  uint64 `json:"claimedOut"`
	IsDivergent bool   `json:"isDivergent"`
}

type BatchFlaggedPayload struct {
	BatchID      uint64 `json:"batchId"`
	PostedRoot   string `json:"postedRoot"`
	ExpectedRoot string `json:"expectedRoot"`
	L2EndBlock   uint64 `json:"l2EndBlock"`
	Reason       string `json:"reason"`
}

type BatchChallengedPayload struct {
	BatchID uint64 `json:"batchId"`
}

type BatchVerifiedPayload struct {
	BatchID      uint64 `json:"batchId"`
	Result       string `json:"result"`
	CostWei      string `json:"costWei"`
	PostedRoot   string `json:"postedRoot,omitempty"`
	ExpectedRoot string `json:"expectedRoot,omitempty"`
	Reason       string `json:"reason"`
}

type DisputeStagePayload struct {
	BatchID     uint64 `json:"batchId"`
	Stage       string `json:"stage"`
	Explanation string `json:"explanation"`
}

type ZkInspectReadyPayload struct {
	BatchID     uint64 `json:"batchId"`
	L2StartBlock uint64 `json:"l2StartBlock"`
	L2EndBlock  uint64 `json:"l2EndBlock"`
	HeaderHash  string `json:"headerHash"`
	PrevStateRoot string `json:"prevStateRoot"`
	ClaimedPostRoot string `json:"claimedPostRoot"`
	RecomputedRoot string `json:"recomputedRoot"`
	BatchDataHash string `json:"batchDataHash"`
	WitnessAccounts int `json:"witnessAccounts"`
	Constraints int    `json:"constraints"`
	ProveMs     int64  `json:"proveMs"`
	VerifyGas   uint64 `json:"verifyGas"`
	Accepted    bool   `json:"accepted"`
	Reason      string `json:"reason,omitempty"`
	// EngineType is the claim the sequencer posted for this batch:
	// "honest" | "obvious" | "subtle" | "buggy". A validity gate rejects the
	// three invalid modes (two lies and one honest-intent bug) identically.
	EngineType string `json:"engineType,omitempty"`
	TxCount    int    `json:"txCount"`
}

// BondSettledPayload describes the collateral waterfall for one batch (WO-5).
// All amounts are wei as decimal strings.
type BondSettledPayload struct {
	BatchID     uint64 `json:"batchId"`
	Outcome     string `json:"outcome"` // "fraud" | "unchallenged" | "challenge_failed"
	Winner      string `json:"winner"`  // "challenger" | "sequencer"
	SeqBondWei  string `json:"seqBondWei"`
	ChalBondWei string `json:"chalBondWei"`
	PayoutWei   string `json:"payoutWei"`
	BurnedWei   string `json:"burnedWei"`
}

type SessionChangedPayload struct {
	Running bool `json:"running"` // session active (started, not stopped)
	Paused  bool `json:"paused"`  // tick loop paused while active
}

type ErrorPayload struct {
	Chain   string `json:"chain"`
	Message string `json:"message"`
}

// --- Bus ---

// Bus is a thread-safe fan-out publish/subscribe bus.
type Bus struct {
	mu   sync.RWMutex
	subs []chan<- Event
}

func NewBus() *Bus { return &Bus{} }

// Subscribe returns a buffered channel that receives events and an unsubscribe func.
func (b *Bus) Subscribe(bufSize int) (<-chan Event, func()) {
	ch := make(chan Event, bufSize)
	b.mu.Lock()
	b.subs = append(b.subs, ch)
	b.mu.Unlock()
	unsub := func() {
		b.mu.Lock()
		for i, s := range b.subs {
			if s == (chan<- Event)(ch) {
				b.subs = append(b.subs[:i], b.subs[i+1:]...)
				break
			}
		}
		b.mu.Unlock()
		close(ch)
	}
	return ch, unsub
}

// Publish sends an event to all subscribers. Slow subscribers are skipped (non-blocking).
func (b *Bus) Publish(e Event) {
	b.mu.RLock()
	defer b.mu.RUnlock()
	for _, ch := range b.subs {
		select {
		case ch <- e:
		default:
		}
	}
}
