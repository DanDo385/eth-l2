package challenge

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/dando385/eth-l2/backend/internal/trace"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

const challengePortalABIStr = `[
  {"type":"function","name":"challengeBatch","inputs":[
    {"name":"batchId","type":"uint64"}
  ],"outputs":[],"stateMutability":"payable"}
]`

const disputeGameABIStr = `[
  {"type":"function","name":"bisect","inputs":[
    {"name":"batchId","type":"uint64"},
    {"name":"claimedStateHash","type":"bytes32"},
    {"name":"position","type":"uint64"}
  ],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"resolve","inputs":[
    {"name":"batchId","type":"uint64"},
    {"name":"batchIsValid","type":"bool"},
    {"name":"divergencePoint","type":"bytes32"}
  ],"outputs":[],"stateMutability":"nonpayable"}
]`

type disputeResolvedPayload struct {
	BatchID       uint64          `json:"batchId"`
	DivergenceIdx int             `json:"divergenceIdx"`
	Op            string          `json:"op"`
	Slot          string          `json:"slot"`
	HonestVal     string          `json:"honestVal"`
	ClaimedVal    string          `json:"claimedVal"`
	HonestSteps   json.RawMessage `json:"honestSteps"`
	ClaimedSteps  json.RawMessage `json:"claimedSteps"`
}

// Challenger auto-challenges flagged batches and exposes manual challenge for the REST API.
type Challenger struct {
	l1Client *chain.Client
	l2Client *chain.Client
	l2Addrs  *chain.Addresses
	st       *store.Store
	bus      *events.Bus

	portal      *bind.BoundContract
	disputeGame *bind.BoundContract
}

func New(
	l1Client, l2Client *chain.Client,
	l1Addrs, l2Addrs *chain.Addresses,
	st *store.Store,
	bus *events.Bus,
) *Challenger {
	portalParsed, _ := abi.JSON(strings.NewReader(challengePortalABIStr))
	gameParsed, _ := abi.JSON(strings.NewReader(disputeGameABIStr))

	return &Challenger{
		l1Client: l1Client,
		l2Client: l2Client,
		l2Addrs:  l2Addrs,
		st:       st,
		bus:      bus,
		portal: bind.NewBoundContract(
			common.HexToAddress(l1Addrs.Portal), portalParsed,
			l1Client.EC, l1Client.EC, l1Client.EC,
		),
		disputeGame: bind.NewBoundContract(
			common.HexToAddress(l1Addrs.Dispute), gameParsed,
			l1Client.EC, l1Client.EC, l1Client.EC,
		),
	}
}

// AutoChallenge blocks until ctx is canceled, challenging every flagged batch.
func (c *Challenger) AutoChallenge(ctx context.Context) {
	ch, unsub := c.bus.Subscribe(64)
	defer unsub()
	for {
		select {
		case <-ctx.Done():
			return
		case ev, ok := <-ch:
			if !ok {
				return
			}
			if ev.Type != events.BatchFlagged {
				continue
			}
			var p events.BatchFlaggedPayload
			if err := json.Unmarshal(ev.Payload, &p); err != nil {
				continue
			}
			go func(batchID uint64) {
				if err := c.Challenge(ctx, batchID); err != nil {
					log.Printf("auto-challenge batch %d: %v", batchID, err)
				}
			}(p.BatchID)
		}
	}
}

// Challenge runs the full bisection + resolve dispute flow for one batch.
func (c *Challenger) Challenge(ctx context.Context, batchID uint64) error {
	batch := c.st.GetBatch(batchID)
	if batch == nil {
		return fmt.Errorf("batch %d not found in store", batchID)
	}

	// 1. Initiate challenge on the portal.
	opts := copyOpts(c.l1Client.Challenger())
	opts.Value = big.NewInt(1e17) // 0.1 ETH challenger bond
	tx, err := c.portal.Transact(opts, "challengeBatch", batchID)
	if err != nil {
		return fmt.Errorf("challengeBatch: %w", err)
	}
	if err := c.l1Client.Mine(ctx, 1); err != nil {
		return fmt.Errorf("mine after challengeBatch: %w", err)
	}
	if _, err := bind.WaitMined(ctx, c.l1Client.EC, tx); err != nil {
		return fmt.Errorf("wait challengeBatch: %w", err)
	}
	c.st.SetChallenged(batchID)

	// 2. Bisection — alternate sequencer / challenger for maxDepth rounds.
	// Sequencer goes first (isSequencerTurn=true after initiate), then challenger, alternating.
	maxDepth := computeMaxDepth(batch.TxCount)
	for depth := 0; depth < maxDepth; depth++ {
		var claimedHash [32]byte                 // zero hash; contract doesn't validate content
		pos := uint64(batch.TxCount+1) / 2      // midpoint of the tx range

		signer := c.l1Client.Challenger()
		if depth%2 == 0 {
			signer = c.l1Client.Sequencer()
		}

		tx, err = c.disputeGame.Transact(copyOpts(signer), "bisect", batchID, claimedHash, pos)
		if err != nil {
			return fmt.Errorf("bisect depth %d: %w", depth, err)
		}
		if err := c.l1Client.Mine(ctx, 1); err != nil {
			return fmt.Errorf("mine after bisect %d: %w", depth, err)
		}
		if _, err := bind.WaitMined(ctx, c.l1Client.EC, tx); err != nil {
			return fmt.Errorf("wait bisect %d: %w", depth, err)
		}
	}

	// 3. Compute the on-chain divergence commitment from actual traces.
	div, err := c.traceDiff(ctx, batch)
	if err != nil {
		return fmt.Errorf("trace diff: %w", err)
	}

	// 4. Resolve the dispute with the divergence point.
	opts = copyOpts(c.l1Client.Challenger())
	tx, err = c.disputeGame.Transact(opts, "resolve", batchID, false, div.Point)
	if err != nil {
		return fmt.Errorf("resolve: %w", err)
	}
	if err := c.l1Client.Mine(ctx, 1); err != nil {
		return fmt.Errorf("mine after resolve: %w", err)
	}
	if _, err := bind.WaitMined(ctx, c.l1Client.EC, tx); err != nil {
		return fmt.Errorf("wait resolve: %w", err)
	}

	// 5. Persist result and broadcast event.
	divInfo := &store.DivInfo{
		DivergenceIdx: div.DivergenceIdx,
		Op:            div.Op,
		Slot:          div.Slot,
		HonestVal:     div.HonestVal,
		ClaimedVal:    div.ClaimedVal,
		HonestSteps:   div.HonestSteps,
		ClaimedSteps:  div.ClaimedSteps,
	}
	c.st.SetResolved(batchID, divInfo)

	honestStepsJSON, _ := json.Marshal(div.HonestSteps)
	claimedStepsJSON, _ := json.Marshal(div.ClaimedSteps)
	c.bus.Publish(events.New(events.DisputeResolved, disputeResolvedPayload{
		BatchID:       batchID,
		DivergenceIdx: div.DivergenceIdx,
		Op:            div.Op,
		Slot:          div.Slot,
		HonestVal:     div.HonestVal,
		ClaimedVal:    div.ClaimedVal,
		HonestSteps:   honestStepsJSON,
		ClaimedSteps:  claimedStepsJSON,
	}))

	return nil
}

// traceDiff replays the first swap tx through honest vs lying engine and returns the divergence.
func (c *Challenger) traceDiff(ctx context.Context, batch *store.BatchInfo) (*trace.DivergenceResult, error) {
	if len(batch.TxHashes) == 0 {
		return nil, fmt.Errorf("batch has no tx hashes")
	}

	txHash := batch.TxHashes[0]

	lyingTx, _, err := c.l2Client.EC.TransactionByHash(ctx, txHash)
	if err != nil {
		return nil, fmt.Errorf("get tx: %w", err)
	}

	lyingResult, err := trace.Transaction(ctx, c.l2Client.EC, txHash)
	if err != nil {
		return nil, fmt.Errorf("trace lying tx: %w", err)
	}

	// Replay same calldata through HonestSwapEngine via storage slot override.
	honestResult, err := trace.HonestReplay(
		ctx,
		c.l2Client.EC,
		common.HexToAddress(c.l2Addrs.SwapRouter),
		common.HexToAddress(c.l2Addrs.HonestSwapEngine),
		lyingTx.Data(),
		"latest",
	)
	if err != nil {
		return nil, fmt.Errorf("honest replay: %w", err)
	}

	div := trace.Diff(honestResult.StructLogs, lyingResult.StructLogs)
	if div == nil {
		return nil, fmt.Errorf("no divergence found — batch may actually be honest")
	}
	return div, nil
}

// computeMaxDepth mirrors the formula in DisputeGameMock.initiate.
func computeMaxDepth(txCount int) int {
	depth := 2
	for (1 << depth) < txCount {
		depth++
	}
	if depth > 10 {
		depth = 10
	}
	return depth
}

func copyOpts(auth *bind.TransactOpts) *bind.TransactOpts {
	c := *auth
	return &c
}
