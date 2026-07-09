package engine

import (
	"context"
	"sync"

	"github.com/dando385/eth-l2/backend/internal/bots"
	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/challenge"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/dando385/eth-l2/backend/internal/sequencer"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/dando385/eth-l2/backend/internal/watcher"
)

type sessionState int

const (
	stateIdle sessionState = iota
	stateRunning
	statePaused
)

// batchEvery is how many L2 blocks form one batch window.
const batchEvery = 5

// Session manages the full lifecycle of one demo run.
type Session struct {
	mu       sync.Mutex
	st       sessionState
	repoRoot string

	anvils  []*chain.Anvil
	clients map[string]*chain.Client
	l1Addrs *chain.Addresses
	l2Addrs map[string]*chain.Addresses

	prng   *seed.PRNG
	speed  int
	cancel context.CancelFunc

	bus         *events.Bus
	transferBot *bots.TransferBot
	opSwapBot   *bots.SwapBot
	zkSwapBot   *bots.SwapBot
	opSeq       *sequencer.OPSequencer
	zkSeq       *sequencer.ZKSequencer
	opWatcher   *watcher.HonestWatcher
	batchStore  *store.Store
	challenger  *challenge.Challenger

	// l2Armed becomes true after the first post-start L1 block settles, which
	// is the signal for L2 bots/sequencers to begin collecting demo batches.
	l2Armed   bool
	opL2Origin uint64
	zkL2Origin uint64
}

func NewSession(repoRoot string) *Session {
	return &Session{
		repoRoot: repoRoot,
		clients:  make(map[string]*chain.Client),
		l2Addrs:  make(map[string]*chain.Addresses),
	}
}

func (s *Session) Bus() *events.Bus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.bus
}

func (s *Session) Store() *store.Store {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.batchStore
}

func (s *Session) Challenger() *challenge.Challenger {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.challenger
}

func (s *Session) L1Addrs() *chain.Addresses {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.l1Addrs
}

func (s *Session) L2Addrs(name string) *chain.Addresses {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.l2Addrs[name]
}

func (s *Session) Client(name string) *chain.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.clients[name]
}
