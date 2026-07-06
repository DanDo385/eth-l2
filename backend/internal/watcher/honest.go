package watcher

import (
	"bytes"
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/sequencer"
	"github.com/dando385/eth-l2/backend/internal/store"
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

// seedSelector matches the engine seed() call — keccak256("seed(address,uint256)")[:4].
// The watcher tracks seeds so the sequencer's mid-run trader top-ups keep the sim's
// balanceA in step and never look like fraud (WO-1: balanceA is part of the root).
var seedSelector = crypto.Keccak256([]byte("seed(address,uint256)"))[:4]

const swapABIStr = `[
  {"type":"function","name":"swap","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountIn","type":"uint256"},
    {"name":"nonce","type":"uint256"}
  ],"outputs":[
    {"name":"swapId","type":"uint64"},
    {"name":"amountOut","type":"uint256"}
  ],"stateMutability":"nonpayable"},
  {"type":"function","name":"seed","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountA","type":"uint256"}
  ],"outputs":[],"stateMutability":"nonpayable"}
]`

// honestSim mirrors the HonestSwapEngine state in pure Go so the watcher
// can compute expected state roots without touching the chain. The state root
// is a commitment over the full account balance set, folded in registration
// order, identical to SwapEngineStorage._recomputeRoot (WO-1).
type honestSim struct {
	balanceA   map[common.Address]*big.Int
	balanceB   map[common.Address]*big.Int
	nonces     map[common.Address]*big.Int
	accounts   []common.Address
	registered map[common.Address]bool
	stateRoot  [32]byte
}

func newHonestSim(traders []common.Address, initialBalance int64) *honestSim {
	h := &honestSim{
		balanceA:   make(map[common.Address]*big.Int),
		balanceB:   make(map[common.Address]*big.Int),
		nonces:     make(map[common.Address]*big.Int),
		registered: make(map[common.Address]bool),
	}
	for _, addr := range traders {
		h.register(addr)
		h.balanceA[addr] = big.NewInt(initialBalance)
	}
	h.recomputeRoot()
	return h
}

// register adds an account to the committed set exactly once, mirroring
// SwapEngineStorage._register. Registration order fixes the fold order.
func (h *honestSim) register(a common.Address) {
	if h.registered[a] {
		return
	}
	h.registered[a] = true
	h.accounts = append(h.accounts, a)
	if h.balanceA[a] == nil {
		h.balanceA[a] = big.NewInt(0)
	}
	if h.balanceB[a] == nil {
		h.balanceB[a] = big.NewInt(0)
	}
	if h.nonces[a] == nil {
		h.nonces[a] = big.NewInt(0)
	}
}

// accountLeaf mirrors SwapEngineStorage._accountLeaf:
// keccak256(abi.encodePacked(account, balanceA, balanceB, nonce)).
func (h *honestSim) accountLeaf(a common.Address) [32]byte {
	buf := make([]byte, 0, 20+32*3)
	buf = append(buf, a.Bytes()...)
	buf = append(buf, padLeft32(h.balanceA[a])...)
	buf = append(buf, padLeft32(h.balanceB[a])...)
	buf = append(buf, padLeft32(h.nonces[a])...)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

// recomputeRoot mirrors SwapEngineStorage._recomputeRoot:
// acc_0 = 0; acc_i = keccak256(acc_{i-1} | leaf_i).
func (h *honestSim) recomputeRoot() {
	var acc [32]byte
	for _, a := range h.accounts {
		leaf := h.accountLeaf(a)
		buf := make([]byte, 64)
		copy(buf[:32], acc[:])
		copy(buf[32:], leaf[:])
		copy(acc[:], crypto.Keccak256(buf))
	}
	h.stateRoot = acc
}

// applySeed mirrors an engine seed() call: register the account and set its
// balanceA to an absolute amount. Handling seed here keeps the sim in step with
// the sequencer's mid-run trader top-ups so they never look like fraud.
func (h *honestSim) applySeed(trader common.Address, amountA *big.Int) {
	h.register(trader)
	h.balanceA[trader] = new(big.Int).Set(amountA)
	h.recomputeRoot()
}

func (h *honestSim) apply(trader common.Address, amountIn, nonce *big.Int) error {
	h.register(trader)
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

	h.recomputeRoot()
	return nil
}

// HonestWatcher tracks the expected honest state root on L2 and flags batches
// whose posted state root diverges from what the honest engine would have produced.
type HonestWatcher struct {
	l2Client   *chain.Client
	routerAddr common.Address
	bus        *events.Bus
	st         *store.Store

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
	st *store.Store,
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
		st:               st,
		sim:              newHonestSim(traders, chain.TraderSeedBalance),
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
		if len(tx.Data) < 4 {
			continue
		}
		switch {
		case bytes.Equal(tx.Data[:4], swapSelector):
			trader, amountIn, nonce, err := w.decodeSwap(tx.Data)
			if err != nil {
				continue
			}
			// Non-fatal: a bot nonce error or bad calldata shouldn't crash the watcher.
			_ = w.sim.apply(trader, amountIn, nonce)
		case bytes.Equal(tx.Data[:4], seedSelector):
			trader, amountA, err := w.decodeSeed(tx.Data)
			if err != nil {
				continue
			}
			w.sim.applySeed(trader, amountA)
		}
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
	posted := fmt.Sprintf("0x%x", batch.PostStateRoot)
	expected := fmt.Sprintf("0x%x", expectedRoot)
	reason := fmt.Sprintf(
		"Honest replay of %d swaps across blocks %d–%d produced a different state root than the sequencer posted on L1.",
		batch.TxCount, batch.L2StartBlock, batch.L2EndBlock,
	)
	if w.st != nil {
		w.st.FlagBatchWithRoots(batch.BatchID, posted, expected, reason)
	}
	w.bus.Publish(events.New(events.BatchFlagged, events.BatchFlaggedPayload{
		BatchID:      batch.BatchID,
		PostedRoot:   posted,
		ExpectedRoot: expected,
		L2EndBlock:   batch.L2EndBlock,
		Reason:       reason,
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

func (w *HonestWatcher) decodeSeed(data []byte) (trader common.Address, amountA *big.Int, err error) {
	args, err := w.swapABI.Methods["seed"].Inputs.Unpack(data[4:])
	if err != nil {
		return common.Address{}, nil, err
	}
	if len(args) != 2 {
		return common.Address{}, nil, fmt.Errorf("expected 2 args, got %d", len(args))
	}
	trader, ok := args[0].(common.Address)
	if !ok {
		return common.Address{}, nil, fmt.Errorf("bad trader arg")
	}
	amountA, ok = args[1].(*big.Int)
	if !ok {
		return common.Address{}, nil, fmt.Errorf("bad amountA arg")
	}
	return trader, amountA, nil
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
