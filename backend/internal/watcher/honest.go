package watcher

import (
	"bytes"
	"context"
	"encoding/binary"
	"fmt"
	"math/big"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/bots"
	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/sequencer"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
)

const (
	rate           = 100
	feeBPS         = 30
	bpsDenominator = 10_000
)

// swapSelector mirrors sequencer.swapSelector — keccak256("swap(address,uint256,uint256)")[:4]
var swapSelector = crypto.Keccak256([]byte("swap(address,uint256,uint256)"))[:4]

const swapABIStr = `[
  {"type":"function","name":"swap","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountIn","type":"uint256"},
    {"name":"nonce","type":"uint256"}
  ],"outputs":[
    {"name":"swapId","type":"uint64"},
    {"name":"amountOut","type":"uint256"}
  ],"stateMutability":"nonpayable"}
]`

// honestSim mirrors the HonestSwapEngine state in pure Go so the watcher
// can compute expected state roots without touching the chain.
type honestSim struct {
	balanceA  map[common.Address]*big.Int
	balanceB  map[common.Address]*big.Int
	nonces    map[common.Address]*big.Int
	stateRoot [32]byte
	nextSwapID uint64
}

func newHonestSim(traders []common.Address, initialBalance int64) *honestSim {
	h := &honestSim{
		balanceA: make(map[common.Address]*big.Int),
		balanceB: make(map[common.Address]*big.Int),
		nonces:   make(map[common.Address]*big.Int),
	}
	for _, addr := range traders {
		h.balanceA[addr] = big.NewInt(initialBalance)
		h.balanceB[addr] = big.NewInt(0)
		h.nonces[addr] = big.NewInt(0)
	}
	return h
}

func (h *honestSim) apply(trader common.Address, amountIn, nonce *big.Int) error {
	if h.nonces[trader] == nil {
		h.nonces[trader] = big.NewInt(0)
		h.balanceA[trader] = big.NewInt(0)
		h.balanceB[trader] = big.NewInt(0)
	}
	if h.nonces[trader].Cmp(nonce) != 0 {
		return fmt.Errorf("nonce mismatch: expected %s got %s", h.nonces[trader], nonce)
	}
	if h.balanceA[trader].Cmp(amountIn) < 0 {
		return fmt.Errorf("insufficient balanceA")
	}

	h.nonces[trader].Add(h.nonces[trader], big.NewInt(1))
	h.balanceA[trader].Sub(h.balanceA[trader], amountIn)

	gross := new(big.Int).Mul(amountIn, big.NewInt(rate))
	amountOut := new(big.Int).Mul(gross, big.NewInt(bpsDenominator-feeBPS))
	amountOut.Div(amountOut, big.NewInt(bpsDenominator))

	h.balanceB[trader].Add(h.balanceB[trader], amountOut)

	swapID := h.nextSwapID
	h.nextSwapID++

	sHash := computeSHash(swapID, trader, amountIn, amountOut, nonce)
	h.stateRoot = computeNewRoot(h.stateRoot, sHash)
	return nil
}

// HonestWatcher tracks the expected honest state root on L2 and flags batches
// whose posted state root diverges from what the honest engine would have produced.
type HonestWatcher struct {
	l2Client   *chain.Client
	routerAddr common.Address
	bus        *events.Bus

	sim              *honestSim
	swapABI          abi.ABI
	simRootByL2Block map[uint64][32]byte // snapshot after each block
}

func NewHonestWatcher(
	_ *chain.Client, // l1 (reserved for future on-chain BatchPosted subscription)
	l2Client *chain.Client,
	_ *chain.Addresses,
	l2Addrs *chain.Addresses,
	bus *events.Bus,
) *HonestWatcher {
	traders := []common.Address{
		chain.AnvilAddress(3),
		chain.AnvilAddress(4),
	}
	parsed, _ := abi.JSON(strings.NewReader(swapABIStr))
	return &HonestWatcher{
		l2Client:         l2Client,
		routerAddr:       common.HexToAddress(l2Addrs.SwapRouter),
		bus:              bus,
		sim:              newHonestSim(traders, bots.InitialBalance),
		swapABI:          parsed,
		simRootByL2Block: make(map[uint64][32]byte),
	}
}

// OnL2Block processes all swap transactions in the block and advances the honest simulation.
func (w *HonestWatcher) OnL2Block(_ context.Context, blockNum uint64, block blockReader) error {
	for _, tx := range block.Txs() {
		to := tx.To
		if to == nil || *to != w.routerAddr {
			continue
		}
		if len(tx.Data) < 4 || !bytes.Equal(tx.Data[:4], swapSelector) {
			continue
		}
		trader, amountIn, nonce, err := w.decodeSwap(tx.Data)
		if err != nil {
			continue
		}
		// Non-fatal: a bot nonce error or bad calldata shouldn't crash the watcher.
		_ = w.sim.apply(trader, amountIn, nonce)
	}
	w.simRootByL2Block[blockNum] = w.sim.stateRoot
	return nil
}

// CheckBatch compares the sequencer's posted state root against the honest simulation.
// Call this immediately after the sequencer posts a batch (same tick, same goroutine).
func (w *HonestWatcher) CheckBatch(batch *sequencer.BatchResult) {
	expectedRoot, ok := w.simRootByL2Block[batch.L2EndBlock]
	if !ok {
		return // haven't processed that block yet — shouldn't happen in normal flow
	}
	if expectedRoot == batch.PostStateRoot {
		return // honest
	}
	w.bus.Publish(events.New(events.BatchFlagged, events.BatchFlaggedPayload{
		BatchID:      batch.BatchID,
		PostedRoot:   fmt.Sprintf("0x%x", batch.PostStateRoot),
		ExpectedRoot: fmt.Sprintf("0x%x", expectedRoot),
		L2EndBlock:   batch.L2EndBlock,
	}))
}

// blockReader is an interface over block data so the session can pass block info
// without importing go-ethereum types directly into the watcher.
type blockReader interface {
	Txs() []TxData
}

// TxData is a minimal tx representation for the watcher.
type TxData struct {
	To   *common.Address
	Data []byte
}

func (w *HonestWatcher) decodeSwap(data []byte) (trader common.Address, amountIn, nonce *big.Int, err error) {
	args, err := w.swapABI.Methods["swap"].Inputs.Unpack(data[4:])
	if err != nil {
		return common.Address{}, nil, nil, err
	}
	if len(args) != 3 {
		return common.Address{}, nil, nil, fmt.Errorf("expected 3 args, got %d", len(args))
	}
	trader, ok := args[0].(common.Address)
	if !ok {
		return common.Address{}, nil, nil, fmt.Errorf("bad trader arg")
	}
	amountIn, ok = args[1].(*big.Int)
	if !ok {
		return common.Address{}, nil, nil, fmt.Errorf("bad amountIn arg")
	}
	nonce, ok = args[2].(*big.Int)
	if !ok {
		return common.Address{}, nil, nil, fmt.Errorf("bad nonce arg")
	}
	return trader, amountIn, nonce, nil
}

// computeSHash mirrors: keccak256(abi.encodePacked(swapId, trader, amountIn, amountOut, nonce))
func computeSHash(swapID uint64, trader common.Address, amountIn, amountOut, nonce *big.Int) [32]byte {
	buf := make([]byte, 0, 124)
	var id [8]byte
	binary.BigEndian.PutUint64(id[:], swapID)
	buf = append(buf, id[:]...)
	buf = append(buf, trader.Bytes()...)
	buf = append(buf, padLeft32(amountIn)...)
	buf = append(buf, padLeft32(amountOut)...)
	buf = append(buf, padLeft32(nonce)...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

// computeNewRoot mirrors: keccak256(abi.encodePacked(oldRoot, sHash))
func computeNewRoot(oldRoot, sHash [32]byte) [32]byte {
	buf := make([]byte, 64)
	copy(buf[:32], oldRoot[:])
	copy(buf[32:], sHash[:])
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

func padLeft32(n *big.Int) []byte {
	if n == nil {
		return make([]byte, 32)
	}
	b := n.Bytes()
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	padded := make([]byte, 32)
	copy(padded[32-len(b):], b)
	return padded
}
