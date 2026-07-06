package challenge

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"strings"
	"sync"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/sourcemap"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/dando385/eth-l2/backend/internal/trace"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
)

const challengePortalABIStr = `[
  {"type":"function","name":"challengeBatch","inputs":[
    {"name":"batchId","type":"uint64"}
  ],"outputs":[],"stateMutability":"payable"},
  {"type":"function","name":"finalizeBatch","inputs":[
    {"name":"batchId","type":"uint64"},
    {"name":"valid","type":"bool"}
  ],"outputs":[],"stateMutability":"nonpayable"}
]`

// FraudProofGame ABI: initiate (with the trace-commitment witness), bisect
// (both parties' openings), and resolveOneStep (the agreed pre-state).
const disputeGameABIStr = `[
  {"type":"function","name":"initiate","inputs":[
    {"name":"p","type":"tuple","components":[
      {"name":"batchId","type":"uint64"},
      {"name":"challenger","type":"address"},
      {"name":"sequencer","type":"address"},
      {"name":"seqRoot","type":"bytes32"},
      {"name":"chalRoot","type":"bytes32"},
      {"name":"traceLen","type":"uint64"},
      {"name":"m0Hash","type":"bytes32"},
      {"name":"m0SeqProof","type":"bytes32[]"},
      {"name":"m0ChalProof","type":"bytes32[]"},
      {"name":"seqLastHash","type":"bytes32"},
      {"name":"chalLastHash","type":"bytes32"},
      {"name":"lastSeqProof","type":"bytes32[]"},
      {"name":"lastChalProof","type":"bytes32[]"}
    ]}
  ],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"bisect","inputs":[
    {"name":"batchId","type":"uint64"},
    {"name":"seqMidHash","type":"bytes32"},
    {"name":"seqProof","type":"bytes32[]"},
    {"name":"chalMidHash","type":"bytes32"},
    {"name":"chalProof","type":"bytes32[]"}
  ],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"resolveOneStep","inputs":[
    {"name":"batchId","type":"uint64"},
    {"name":"loState","type":"tuple","components":[
      {"name":"pc","type":"uint256"},
      {"name":"w","type":"uint256[8]"}
    ]}
  ],"outputs":[],"stateMutability":"nonpayable"}
]`

const swapArgsABIStr = `[
  {"type":"function","name":"swap","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountIn","type":"uint256"},
    {"name":"nonce","type":"uint256"}
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
	RawHonestLen  int             `json:"rawHonestLen"`
	RawClaimedLen int             `json:"rawClaimedLen"`
	// OnchainDivergenceStep is the swap-VM step index the on-chain fraud proof
	// isolated the fraud to (the DIV, SUB, etc. that the sequencer got wrong).
	OnchainDivergenceStep int `json:"onchainDivergenceStep"`
	// LyingSource / HonestSource are the resolved Solidity lines (WO-4).
	LyingSource  *sourcemap.SourceLoc `json:"lyingSource,omitempty"`
	HonestSource *sourcemap.SourceLoc `json:"honestSource,omitempty"`
}

// engineSource resolves, via the deployed-bytecode source map, the deviating
// Solidity line in the lying/buggy engine and the honest engine's equivalent.
func (c *Challenger) engineSource(engineType string) (lying, honest *sourcemap.SourceLoc) {
	if c.repoRoot == "" {
		return nil, nil
	}
	var contract, marker string
	switch engineType {
	case "obvious":
		contract, marker = "LyingSwapEngineObvious", "honest * 2"
	case "subtle":
		contract, marker = "LyingSwapEngineSubtle", "amountOut = gross"
	case "buggy":
		contract, marker = "BuggySwapEngine", "netRatePerUnit"
	default:
		return nil, nil
	}
	if r, err := sourcemap.LoadEngine(c.repoRoot, contract); err == nil {
		if loc, ok := r.FindLine(marker); ok {
			lying = &loc
		}
	}
	if r, err := sourcemap.LoadEngine(c.repoRoot, "HonestSwapEngine"); err == nil {
		if loc, ok := r.FindLine("amountOut = (gross"); ok {
			honest = &loc
		}
	}
	return lying, honest
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
	swapABI     abi.ABI
	repoRoot    string

	inFlight sync.Map // batchID -> struct{}
}

func New(
	l1Client, l2Client *chain.Client,
	l1Addrs, l2Addrs *chain.Addresses,
	st *store.Store,
	bus *events.Bus,
	repoRoot string,
) *Challenger {
	portalParsed, _ := abi.JSON(strings.NewReader(challengePortalABIStr))
	gameParsed, _ := abi.JSON(strings.NewReader(disputeGameABIStr))
	swapParsed, _ := abi.JSON(strings.NewReader(swapArgsABIStr))

	return &Challenger{
		l1Client: l1Client,
		l2Client: l2Client,
		l2Addrs:  l2Addrs,
		st:       st,
		bus:      bus,
		swapABI:  swapParsed,
		repoRoot: repoRoot,
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
	if _, loaded := c.inFlight.LoadOrStore(batchID, struct{}{}); loaded {
		return fmt.Errorf("batch %d challenge already in progress", batchID)
	}
	defer c.inFlight.Delete(batchID)

	batch := c.st.GetBatch(batchID)
	if batch == nil {
		return fmt.Errorf("batch %d not found in store", batchID)
	}
	if batch.Challenged {
		return fmt.Errorf("batch %d already challenged", batchID)
	}
	if batch.Resolved {
		return fmt.Errorf("batch %d already resolved", batchID)
	}
	if len(batch.TxHashes) == 0 {
		return fmt.Errorf("batch %d has no tx hashes", batchID)
	}

	// 1. Initiate challenge on the portal.
	opts := chain.WithGas(copyOpts(c.l1Client.Challenger()), chain.GasLimitL1Portal)
	opts.Value = chain.BondAmount()
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
	c.bus.Publish(events.New(events.BatchChallenged, events.BatchChallengedPayload{
		BatchID: batchID,
	}))

	// 2. Compute the on-chain divergence commitment from actual traces.
	div, err := c.traceDiff(ctx, batch)
	if err != nil {
		return fmt.Errorf("trace diff: %w", err)
	}

	// 3. Run the real interactive fraud proof on-chain: commit both execution
	// traces, bisect to the single diverging step, and let FraudProofGame
	// re-execute that step and derive the verdict (which finalizes the batch).
	onchainStep, err := c.runFraudProof(ctx, batch)
	if err != nil {
		return fmt.Errorf("fraud proof: %w", err)
	}

	// 4. Resolve the deviating Solidity line (WO-4) via the deployed source map.
	lyingSrc, honestSrc := c.engineSource(batch.EngineType)

	// 5. Persist result and broadcast event.
	divInfo := &store.DivInfo{
		DivergenceIdx:         div.DivergenceIdx,
		Op:                    div.Op,
		Slot:                  div.Slot,
		HonestVal:             div.HonestVal,
		ClaimedVal:            div.ClaimedVal,
		HonestSteps:           div.HonestSteps,
		ClaimedSteps:          div.ClaimedSteps,
		RawHonestLen:          div.RawHonestLen,
		RawClaimedLen:         div.RawClaimedLen,
		OnchainDivergenceStep: onchainStep,
		LyingSource:           lyingSrc,
		HonestSource:          honestSrc,
	}
	c.st.SetResolved(batchID, divInfo)

	honestStepsJSON, _ := json.Marshal(div.HonestSteps)
	claimedStepsJSON, _ := json.Marshal(div.ClaimedSteps)
	c.bus.Publish(events.New(events.DisputeResolved, disputeResolvedPayload{
		BatchID:               batchID,
		DivergenceIdx:         div.DivergenceIdx,
		Op:                    div.Op,
		Slot:                  div.Slot,
		HonestVal:             div.HonestVal,
		ClaimedVal:            div.ClaimedVal,
		HonestSteps:           honestStepsJSON,
		ClaimedSteps:          claimedStepsJSON,
		RawHonestLen:          div.RawHonestLen,
		RawClaimedLen:         div.RawClaimedLen,
		OnchainDivergenceStep: onchainStep,
		LyingSource:           lyingSrc,
		HonestSource:          honestSrc,
	}))

	// Broadcast the collateral waterfall: fraud proven, so the challenger takes
	// both bonds minus the attributable-fault burn.
	c.bus.Publish(events.New(events.BondSettled, bondSettled(batchID, "fraud", "challenger")))

	return nil
}

// bondSettled computes the collateral outcome for one batch, mirroring
// OptimisticPortalMock (0.1 ETH bonds, 10% burn on the loser's stake).
func bondSettled(batchID uint64, outcome, winner string) events.BondSettledPayload {
	seqBond := chain.BondAmount()
	chalBond := chain.BondAmount()
	pot := new(big.Int).Add(seqBond, chalBond)
	var burn *big.Int
	if outcome == "unchallenged" {
		burn = big.NewInt(0)
		pot = new(big.Int).Set(seqBond) // only the sequencer bond is returned
		chalBond = big.NewInt(0)
	} else {
		// burn 10% of the loser's slashed bond (the loser posted one bond).
		burn = new(big.Int).Div(new(big.Int).Mul(seqBond, big.NewInt(1000)), big.NewInt(10000))
	}
	payout := new(big.Int).Sub(pot, burn)
	return events.BondSettledPayload{
		BatchID:     batchID,
		Outcome:     outcome,
		Winner:      winner,
		SeqBondWei:  seqBond.String(),
		ChalBondWei: chalBond.String(),
		PayoutWei:   payout.String(),
		BurnedWei:   burn.String(),
	}
}

// runFraudProof drives the on-chain interactive fraud proof for one fraudulent
// batch and returns the step index the game isolated the fraud to. It builds
// the honest and lying execution traces over the swap step-VM (matching the
// on-chain SwapStepVM), commits Merkle roots, bisects to one step, and calls
// resolveOneStep, which re-executes that step on L1 and finalizes the batch.
func (c *Challenger) runFraudProof(ctx context.Context, batch *store.BatchInfo) (int, error) {
	amountIn, err := c.firstSwapAmountIn(ctx, batch)
	if err != nil {
		return 0, fmt.Errorf("decode amountIn: %w", err)
	}

	honest := honestTrace(amountIn)
	badStep, badDst, badValue, ok := fraudParams(amountIn, batch.EngineType)
	if !ok {
		return 0, fmt.Errorf("batch %d engine %q is not fraudulent", batch.BatchID, batch.EngineType)
	}
	lying := lyingTrace(honest, badStep, badDst, badValue)

	seqLeaves := leavesOf(lying)   // sequencer posted the lie
	chalLeaves := leavesOf(honest) // challenger runs it honestly

	seqAddr := c.l1Client.Sequencer().From
	chalAddr := c.l1Client.Challenger().From

	// initiate
	p := abiInitParams{
		BatchId:       batch.BatchID,
		Challenger:    chalAddr,
		Sequencer:     seqAddr,
		SeqRoot:       merkleRoot(seqLeaves),
		ChalRoot:      merkleRoot(chalLeaves),
		TraceLen:      vmTraceLen,
		M0Hash:        seqLeaves[0],
		M0SeqProof:    merkleProof(seqLeaves, 0),
		M0ChalProof:   merkleProof(chalLeaves, 0),
		SeqLastHash:   seqLeaves[vmTraceLen-1],
		ChalLastHash:  chalLeaves[vmTraceLen-1],
		LastSeqProof:  merkleProof(seqLeaves, vmTraceLen-1),
		LastChalProof: merkleProof(chalLeaves, vmTraceLen-1),
	}
	if err := c.sendGameTx(ctx, "initiate", p); err != nil {
		return 0, fmt.Errorf("initiate: %w", err)
	}

	// bisect, mirroring the contract's lo/hi narrowing
	lo, hi := 0, vmTraceLen-1
	for hi > lo+1 {
		mid := (lo + hi) / 2
		if err := c.sendGameTx(ctx, "bisect", batch.BatchID,
			seqLeaves[mid], merkleProof(seqLeaves, mid),
			chalLeaves[mid], merkleProof(chalLeaves, mid)); err != nil {
			return 0, fmt.Errorf("bisect mid %d: %w", mid, err)
		}
		if seqLeaves[mid] == chalLeaves[mid] {
			lo = mid
		} else {
			hi = mid
		}
	}

	// resolveOneStep with the agreed pre-state at lo
	if err := c.sendGameTx(ctx, "resolveOneStep", batch.BatchID, toABIState(honest[lo])); err != nil {
		return 0, fmt.Errorf("resolveOneStep: %w", err)
	}
	return lo, nil
}

// sendGameTx submits one FraudProofGame call from the challenger, mines it, and
// waits for it to be included.
func (c *Challenger) sendGameTx(ctx context.Context, method string, args ...interface{}) error {
	opts := chain.WithGas(copyOpts(c.l1Client.Challenger()), chain.GasLimitL1Portal)
	tx, err := c.disputeGame.Transact(opts, method, args...)
	if err != nil {
		return err
	}
	if err := c.l1Client.Mine(ctx, 1); err != nil {
		return err
	}
	_, err = bind.WaitMined(ctx, c.l1Client.EC, tx)
	return err
}

// firstSwapAmountIn decodes amountIn from the batch's first swap transaction.
func (c *Challenger) firstSwapAmountIn(ctx context.Context, batch *store.BatchInfo) (int64, error) {
	tx, _, err := c.l2Client.EC.TransactionByHash(ctx, batch.TxHashes[0])
	if err != nil {
		return 0, err
	}
	data := tx.Data()
	if len(data) < 4 {
		return 0, fmt.Errorf("short calldata")
	}
	args, err := c.swapABI.Methods["swap"].Inputs.Unpack(data[4:])
	if err != nil {
		return 0, err
	}
	amountIn, ok := args[1].(*big.Int)
	if !ok {
		return 0, fmt.Errorf("bad amountIn arg")
	}
	return amountIn.Int64(), nil
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

	// Use the block before the tx was mined so the storage state (nonces, balances)
	// matches what the engine saw when it originally executed the swap.
	receipt, err := c.l2Client.EC.TransactionReceipt(ctx, txHash)
	if err != nil {
		return nil, fmt.Errorf("get receipt: %w", err)
	}
	blockTag := fmt.Sprintf("0x%x", receipt.BlockNumber.Uint64()-1)

	chainID, err := c.l2Client.EC.ChainID(ctx)
	if err != nil {
		return nil, fmt.Errorf("chain id: %w", err)
	}
	from, err := types.Sender(types.LatestSignerForChainID(chainID), lyingTx)
	if err != nil {
		return nil, fmt.Errorf("tx sender: %w", err)
	}

	honestResult, err := trace.HonestReplay(
		ctx,
		c.l2Client.EC,
		from,
		common.HexToAddress(c.l2Addrs.SwapRouter),
		common.HexToAddress(c.l2Addrs.HonestSwapEngine),
		lyingTx.Data(),
		blockTag,
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

// FinalizeUnchallenged finalizes an honest, unchallenged batch once its
// challenge window has closed, returning the sequencer's bond. It is best
// effort: if the on-chain window has not elapsed the portal reverts and the
// caller retries on a later tick. On success it broadcasts the bond return.
func (c *Challenger) FinalizeUnchallenged(ctx context.Context, batchID uint64) error {
	opts := chain.WithGas(copyOpts(c.l1Client.Sequencer()), chain.GasLimitL1Portal)
	tx, err := c.portal.Transact(opts, "finalizeBatch", batchID, true)
	if err != nil {
		return err
	}
	if err := c.l1Client.Mine(ctx, 1); err != nil {
		return err
	}
	if _, err := bind.WaitMined(ctx, c.l1Client.EC, tx); err != nil {
		return err
	}
	c.st.SetFinalized(batchID)
	c.bus.Publish(events.New(events.BondSettled, bondSettled(batchID, "unchallenged", "sequencer")))
	return nil
}

func copyOpts(auth *bind.TransactOpts) *bind.TransactOpts {
	c := *auth
	return &c
}
