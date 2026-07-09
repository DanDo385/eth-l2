package sequencer

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"math/big"
	"strings"
	"time"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const portalABI = `[
  {"type":"function","name":"postBatch","inputs":[
    {"name":"header","type":"tuple","components":[
      {"name":"batchId","type":"uint64"},
      {"name":"prevStateRoot","type":"bytes32"},
      {"name":"postStateRoot","type":"bytes32"},
      {"name":"batchDataHash","type":"bytes32"},
      {"name":"l2StartBlock","type":"uint64"},
      {"name":"l2EndBlock","type":"uint64"},
      {"name":"txCount","type":"uint32"},
      {"name":"timestamp","type":"uint64"}
    ]},
    {"name":"rawData","type":"bytes"}
  ],"outputs":[],"stateMutability":"payable"}
]`

const routerABI = `[
  {"type":"function","name":"setImplementation","inputs":[
    {"name":"impl","type":"address"}
  ],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"stateRoot","inputs":[],"outputs":[
    {"name":"","type":"bytes32"}
  ],"stateMutability":"view"}
]`

// BatchHeader mirrors DataTypes.BatchHeader for ABI encoding.
type BatchHeader struct {
	BatchId       uint64
	PrevStateRoot [32]byte
	PostStateRoot [32]byte
	BatchDataHash [32]byte
	L2StartBlock  uint64
	L2EndBlock    uint64
	TxCount       uint32
	Timestamp     uint64
}

// pendingSwap records one swap tx collected for the current batch window.
type pendingSwap struct {
	Hash  common.Hash
	Block uint64
}

// BatchResult is returned by OnBlock when a batch was just posted.
// L2StartBlock / L2EndBlock are demo-relative (0-based after L1 arming).
// AbsoluteL2EndBlock is the Anvil tip used by the honest watcher.
type BatchResult struct {
	BatchID            uint64
	PostStateRoot      [32]byte
	L2StartBlock       uint64
	L2EndBlock         uint64
	AbsoluteL2EndBlock uint64
	TxCount            int
	EngineType         string
	TxHashes           []common.Hash // copy of tx hashes included in the batch
	Swaps              []store.SwapSummary
}

// swapSelector is keccak256("swap(address,uint256,uint256)")[:4]
var swapSelector = crypto.Keccak256([]byte("swap(address,uint256,uint256)"))[:4]

// OPSequencer posts OP batches to L1, injecting fraud deterministically from the seed.
type OPSequencer struct {
	l1Client   *chain.Client
	l2Client   *chain.Client
	l1Addrs    *chain.Addresses
	l2Addrs    *chain.Addresses
	prng       *seed.PRNG
	bus        *events.Bus
	batchEvery int // post a batch every N L2 blocks

	portal *bind.BoundContract
	router *bind.BoundContract

	nextBatchID    uint64
	origin         uint64 // Anvil tip when L1 armed the lane; relative = abs - origin - 1
	inWindow       bool
	windowStartAbs uint64
	prevStateRoot  [32]byte
	pendingSwaps   []pendingSwap
	nextEngine     common.Address // claimed engine for next batch; actual OP L2 execution stays honest
	nextEngineType string
}

// Arm records the L2 tip at the moment L1 first settles after session start.
// Subsequent batch windows number L2 blocks from 0 relative to that tip.
func (s *OPSequencer) Arm(origin uint64) {
	s.origin = origin
}

func NewOPSequencer(
	l1Client, l2Client *chain.Client,
	l1Addrs, l2Addrs *chain.Addresses,
	prng *seed.PRNG,
	bus *events.Bus,
	batchEvery int,
) *OPSequencer {
	portalParsed, _ := abi.JSON(strings.NewReader(portalABI))
	routerParsed, _ := abi.JSON(strings.NewReader(routerABI))

	portalContract := bind.NewBoundContract(
		common.HexToAddress(l1Addrs.Portal), portalParsed,
		l1Client.EC, l1Client.EC, l1Client.EC,
	)
	routerContract := bind.NewBoundContract(
		common.HexToAddress(l2Addrs.SwapRouter), routerParsed,
		l2Client.EC, l2Client.EC, l2Client.EC,
	)

	s := &OPSequencer{
		l1Client:   l1Client,
		l2Client:   l2Client,
		l1Addrs:    l1Addrs,
		l2Addrs:    l2Addrs,
		prng:       prng,
		bus:        bus,
		batchEvery: batchEvery,
		portal:     portalContract,
		router:     routerContract,
	}
	// Prime the first window's engine choice.
	s.nextEngine, s.nextEngineType = s.chooseEngine(0)
	return s
}

// rel maps an absolute Anvil block to the demo-relative index (first post-arm block = 0).
func (s *OPSequencer) rel(abs uint64) uint64 {
	if abs <= s.origin {
		return 0
	}
	return abs - s.origin - 1
}

// OnBlock is called for each new L2 block. Returns a non-nil BatchResult when a batch was posted.
func (s *OPSequencer) OnBlock(ctx context.Context, blockNum uint64) (*BatchResult, error) {
	if !s.inWindow {
		s.inWindow = true
		s.windowStartAbs = blockNum
		// Keep canonical L2 execution honest. Faults are injected into the L1
		// output root claim, not by poisoning live L2 state.
		if err := s.setImpl(ctx, common.HexToAddress(s.l2Addrs.HonestSwapEngine)); err != nil {
			return nil, fmt.Errorf("setImplementation: %w", err)
		}
	}

	// Collect swap tx hashes from this block (store relative block for the UI).
	block, err := s.l2Client.EC.BlockByNumber(ctx, big.NewInt(int64(blockNum)))
	if err != nil {
		return nil, err
	}
	for _, tx := range block.Transactions() {
		if isSwapTx(tx.To(), tx.Data(), common.HexToAddress(s.l2Addrs.SwapRouter)) {
			s.pendingSwaps = append(s.pendingSwaps, pendingSwap{
				Hash:  tx.Hash(),
				Block: s.rel(blockNum),
			})
		}
	}

	// Post batch when the window is full.
	if int(blockNum-s.windowStartAbs)+1 >= s.batchEvery {
		return s.postBatch(ctx, blockNum)
	}
	return nil, nil
}

func (s *OPSequencer) postBatch(ctx context.Context, l2EndBlock uint64) (*BatchResult, error) {
	// Read the current state root from the router (result of the engine that processed swaps).
	var rootOut []interface{}
	if err := s.router.Call(&bind.CallOpts{Context: ctx}, &rootOut, "stateRoot"); err != nil {
		return nil, fmt.Errorf("read stateRoot: %w", err)
	}
	effectiveEngineType := s.nextEngineType
	if len(s.pendingSwaps) == 0 {
		effectiveEngineType = "honest"
	}
	honestPostStateRoot := rootOut[0].([32]byte)
	postStateRoot := claimedRoot(honestPostStateRoot, effectiveEngineType, s.nextBatchID)

	// Build rawData = packed tx hashes; batchDataHash = keccak256(rawData).
	txHashes := make([]common.Hash, len(s.pendingSwaps))
	for i, ps := range s.pendingSwaps {
		txHashes[i] = ps.Hash
	}
	rawData := packHashes(txHashes)
	var batchDataHash [32]byte
	copy(batchDataHash[:], crypto.Keccak256(rawData))

	batchID := s.nextBatchID
	relStart := s.rel(s.windowStartAbs)
	relEnd := s.rel(l2EndBlock)
	header := BatchHeader{
		BatchId:       batchID,
		PrevStateRoot: s.prevStateRoot,
		PostStateRoot: postStateRoot,
		BatchDataHash: batchDataHash,
		L2StartBlock:  relStart,
		L2EndBlock:    relEnd,
		TxCount:       uint32(len(s.pendingSwaps)),
		Timestamp:     uint64(time.Now().Unix()),
	}

	opts := chain.WithGas(copyOpts(s.l1Client.Sequencer()), chain.GasLimitL1Portal)
	opts.Value = chain.BondAmount()
	if _, err := s.portal.Transact(opts, "postBatch", header, rawData); err != nil {
		return nil, fmt.Errorf("postBatch: %w", err)
	}

	swaps, err := buildSwapSummaries(ctx, s.l2Client, s.pendingSwaps, effectiveEngineType)
	if err != nil {
		return nil, fmt.Errorf("swap summaries: %w", err)
	}

	result := &BatchResult{
		BatchID:            batchID,
		PostStateRoot:      postStateRoot,
		L2StartBlock:       relStart,
		L2EndBlock:         relEnd,
		AbsoluteL2EndBlock: l2EndBlock,
		TxCount:            len(s.pendingSwaps),
		EngineType:         effectiveEngineType,
		TxHashes:           append([]common.Hash(nil), txHashes...),
		Swaps:              swaps,
	}

	// Publish event so the frontend and watcher can react.
	swapPayload := make([]events.SwapSummary, len(swaps))
	for i, sw := range swaps {
		swapPayload[i] = events.SwapSummary{
			L2Block:     sw.L2Block,
			TxHash:      sw.TxHash,
			TraderIndex: sw.TraderIndex,
			AmountIn:    sw.AmountIn,
			HonestOut:   sw.HonestOut,
			ClaimedOut:  sw.ClaimedOut,
			GasUsed:     sw.GasUsed,
			IsDivergent: sw.IsDivergent,
		}
	}
	s.bus.Publish(events.New(events.BatchPosted, events.BatchPostedPayload{
		BatchID:       batchID,
		PostStateRoot: fmt.Sprintf("0x%x", postStateRoot),
		L2StartBlock:  relStart,
		L2EndBlock:    relEnd,
		TxCount:       len(s.pendingSwaps),
		EngineType:    effectiveEngineType,
		Swaps:         swapPayload,
	}))

	// Advance to next window.
	s.nextBatchID++
	s.prevStateRoot = honestPostStateRoot
	s.inWindow = false
	s.windowStartAbs = 0
	s.pendingSwaps = nil

	// Choose and set the engine for the NEXT batch window so the implementation is
	// already in place when the swap bot submits to the new window.
	s.nextEngine, s.nextEngineType = s.chooseEngine(s.nextBatchID)

	return result, nil
}

// chooseEngine picks honest/obvious/subtle deterministically from the seed.
// Fault rate: approximately 1/8 total. A faulty batch then splits between the
// obvious and subtle lying engines.
func (s *OPSequencer) chooseEngine(batchID uint64) (common.Address, string) {
	derived := s.prng.KeccakDerive(fmt.Sprintf("engine:%d", batchID))
	if binary.BigEndian.Uint64(derived[:8])%OptimisticSuspicionDenominator != 0 {
		return common.HexToAddress(s.l2Addrs.HonestSwapEngine), "honest"
	}
	if derived[8]%2 == 0 {
		return common.HexToAddress(s.l2Addrs.LyingObvious), "obvious"
	}
	return common.HexToAddress(s.l2Addrs.LyingSubtle), "subtle"
}

func (s *OPSequencer) setImpl(ctx context.Context, impl common.Address) error {
	opts := chain.WithGas(copyOpts(s.l2Client.Sequencer()), chain.GasLimitSwap)
	_, err := s.router.Transact(opts, "setImplementation", impl)
	return err
}

func claimedRoot(honest [32]byte, engineType string, batchID uint64) [32]byte {
	if engineType == "honest" {
		return honest
	}
	buf := make([]byte, 0, len(honest)+len(engineType)+8)
	buf = append(buf, honest[:]...)
	buf = append(buf, []byte(engineType)...)
	var id [8]byte
	binary.BigEndian.PutUint64(id[:], batchID)
	buf = append(buf, id[:]...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

func isSwapTx(to *common.Address, data []byte, routerAddr common.Address) bool {
	if to == nil || *to != routerAddr {
		return false
	}
	return len(data) >= 4 && bytes.Equal(data[:4], swapSelector)
}

func packHashes(hashes []common.Hash) []byte {
	buf := make([]byte, len(hashes)*32)
	for i, h := range hashes {
		copy(buf[i*32:], h.Bytes())
	}
	return buf
}

func copyOpts(auth *bind.TransactOpts) *bind.TransactOpts {
	c := *auth
	return &c
}
