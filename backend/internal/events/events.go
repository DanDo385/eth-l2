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
	BatchChallenged Type = "batch_challenged"
	DisputeResolved Type = "dispute_resolved"
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
	BatchID       uint64 `json:"batchId"`
	PostStateRoot string `json:"postStateRoot"` // hex
	L2StartBlock  uint64 `json:"l2StartBlock"`
	L2EndBlock    uint64 `json:"l2EndBlock"`
	TxCount       int    `json:"txCount"`
	EngineType    string `json:"engineType"` // "honest" | "obvious" | "subtle"
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

type ZkInspectReadyPayload struct {
	BatchID     uint64 `json:"batchId"`
	L2EndBlock  uint64 `json:"l2EndBlock"`
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
