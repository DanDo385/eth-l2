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

// BatchResult is returned by OnBlock when a batch was just posted.
type BatchResult struct {
	BatchID       uint64
	PostStateRoot [32]byte
	L2StartBlock  uint64
	L2EndBlock    uint64
	TxCount       int
	EngineType    string
	TxHashes      []common.Hash // copy of tx hashes included in the batch
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
	windowStart    uint64
	prevStateRoot  [32]byte
	pendingTxHashes []common.Hash
	nextEngine     common.Address // engine to use for next batch (set at end of prev batch)
	nextEngineType string
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

// OnBlock is called for each new L2 block. Returns a non-nil BatchResult when a batch was posted.
func (s *OPSequencer) OnBlock(ctx context.Context, blockNum uint64) (*BatchResult, error) {
	if s.windowStart == 0 {
		s.windowStart = blockNum
		// Set the implementation for this batch window.
		if err := s.setImpl(ctx, s.nextEngine); err != nil {
			return nil, fmt.Errorf("setImplementation: %w", err)
		}
	}

	// Collect swap tx hashes from this block.
	block, err := s.l2Client.EC.BlockByNumber(ctx, big.NewInt(int64(blockNum)))
	if err != nil {
		return nil, err
	}
	for _, tx := range block.Transactions() {
		if isSwapTx(tx.To(), tx.Data(), common.HexToAddress(s.l2Addrs.SwapRouter)) {
			s.pendingTxHashes = append(s.pendingTxHashes, tx.Hash())
		}
	}

	// Post batch when the window is full.
	if int(blockNum-s.windowStart)+1 >= s.batchEvery {
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
	postStateRoot := rootOut[0].([32]byte)

	// Build rawData = packed tx hashes; batchDataHash = keccak256(rawData).
	rawData := packHashes(s.pendingTxHashes)
	var batchDataHash [32]byte
	copy(batchDataHash[:], crypto.Keccak256(rawData))

	batchID := s.nextBatchID
	header := BatchHeader{
		BatchId:       batchID,
		PrevStateRoot: s.prevStateRoot,
		PostStateRoot: postStateRoot,
		BatchDataHash: batchDataHash,
		L2StartBlock:  s.windowStart,
		L2EndBlock:    l2EndBlock,
		TxCount:       uint32(len(s.pendingTxHashes)),
		Timestamp:     uint64(time.Now().Unix()),
	}

	opts := copyOpts(s.l1Client.Sequencer())
	opts.Value = big.NewInt(1e17) // 0.1 ETH bond
	if _, err := s.portal.Transact(opts, "postBatch", header, rawData); err != nil {
		return nil, fmt.Errorf("postBatch: %w", err)
	}

	result := &BatchResult{
		BatchID:       batchID,
		PostStateRoot: postStateRoot,
		L2StartBlock:  s.windowStart,
		L2EndBlock:    l2EndBlock,
		TxCount:       len(s.pendingTxHashes),
		EngineType:    s.nextEngineType,
		TxHashes:      append([]common.Hash(nil), s.pendingTxHashes...),
	}

	// Publish event so the frontend and watcher can react.
	s.bus.Publish(events.New(events.BatchPosted, events.BatchPostedPayload{
		BatchID:       batchID,
		PostStateRoot: fmt.Sprintf("0x%x", postStateRoot),
		L2StartBlock:  s.windowStart,
		L2EndBlock:    l2EndBlock,
		TxCount:       len(s.pendingTxHashes),
		EngineType:    s.nextEngineType,
	}))

	// Advance to next window.
	s.nextBatchID++
	s.prevStateRoot = postStateRoot
	s.windowStart = 0
	s.pendingTxHashes = nil

	// Choose and set the engine for the NEXT batch window so the implementation is
	// already in place when the swap bot submits to the new window.
	s.nextEngine, s.nextEngineType = s.chooseEngine(s.nextBatchID)

	return result, nil
}

// chooseEngine picks honest/obvious/subtle deterministically from the seed.
func (s *OPSequencer) chooseEngine(batchID uint64) (common.Address, string) {
	derived := s.prng.KeccakDerive(fmt.Sprintf("engine:%d", batchID))
	choice := binary.BigEndian.Uint64(derived[:8]) % 3
	switch choice {
	case 1:
		return common.HexToAddress(s.l2Addrs.LyingObvious), "obvious"
	case 2:
		return common.HexToAddress(s.l2Addrs.LyingSubtle), "subtle"
	default:
		return common.HexToAddress(s.l2Addrs.HonestSwapEngine), "honest"
	}
}

func (s *OPSequencer) setImpl(ctx context.Context, impl common.Address) error {
	opts := copyOpts(s.l2Client.Sequencer())
	_, err := s.router.Transact(opts, "setImplementation", impl)
	return err
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
