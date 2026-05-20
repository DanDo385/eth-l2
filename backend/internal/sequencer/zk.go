package sequencer

import (
	"context"
	"math/rand"
	"time"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/seed"
)

// ZKSequencer is a stub that emits zk_inspect_ready events on each batch window.
// It does not submit to the ZkRollupMock contract (that is left for Phase 5 cleanup).
type ZKSequencer struct {
	l2Client   *chain.Client
	prng       *seed.PRNG
	bus        *events.Bus
	batchEvery int

	nextBatchID uint64
	windowStart uint64
	txCount     int
}

func NewZKSequencer(
	_ *chain.Client, // l1 (unused in stub)
	l2Client *chain.Client,
	_ *chain.Addresses, // l1Addrs (unused)
	_ *chain.Addresses, // l2Addrs (unused)
	prng *seed.PRNG,
	bus *events.Bus,
	batchEvery int,
) *ZKSequencer {
	return &ZKSequencer{
		l2Client:   l2Client,
		prng:       prng,
		bus:        bus,
		batchEvery: batchEvery,
	}
}

// OnBlock is called for each new ZK-L2 block.
func (s *ZKSequencer) OnBlock(_ context.Context, blockNum uint64) {
	if s.windowStart == 0 {
		s.windowStart = blockNum
	}
	s.txCount++

	if int(blockNum-s.windowStart)+1 >= s.batchEvery {
		s.emitInspect()
		s.nextBatchID++
		s.windowStart = 0
		s.txCount = 0
	}
}

func (s *ZKSequencer) emitInspect() {
	// Stub: simulate a proof with plausible numbers.
	constraints := 50_000 + rand.Intn(200_000) //nolint:gosec
	proveMs := int64(200 + rand.Intn(800))      //nolint:gosec
	verifyGas := uint64(250_000)

	_ = time.Now() // for future latency tracking
	s.bus.Publish(events.New(events.ZkInspectReady, events.ZkInspectReadyPayload{
		BatchID:     s.nextBatchID,
		L2EndBlock:  s.windowStart + uint64(s.batchEvery) - 1,
		Constraints: constraints,
		ProveMs:     proveMs,
		VerifyGas:   verifyGas,
	}))
}
