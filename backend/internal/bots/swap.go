package bots

import (
	"context"
	"fmt"
	"math/big"
	"strings"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
)

// TraderCount is the number of trader accounts the swap bot cycles through.
const TraderCount = 2

// InitialBalance is the balanceA seeded to each trader at session start.
const InitialBalance = 10_000

const swapRouterABI = `[
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
  ],"outputs":[  ],"stateMutability":"nonpayable"},
  {"type":"function","name":"nonces","inputs":[
    {"name":"trader","type":"address"}
  ],"outputs":[
    {"name":"","type":"uint256"}
  ],"stateMutability":"view"}
]`

// SwapBot submits one swap per L2 block, cycling traders deterministically.
type SwapBot struct {
	client     *chain.Client
	contract   *bind.BoundContract
	routerAddr common.Address
	prng       *seed.PRNG
	// swapNonces tracks the contract-level nonce per trader (distinct from Ethereum nonces).
	swapNonces map[common.Address]*big.Int
	seeded     bool
}

func NewSwapBot(client *chain.Client, routerAddr common.Address, prng *seed.PRNG) (*SwapBot, error) {
	parsed, err := abi.JSON(strings.NewReader(swapRouterABI))
	if err != nil {
		return nil, err
	}
	contract := bind.NewBoundContract(routerAddr, parsed, client.EC, client.EC, client.EC)
	b := &SwapBot{
		client:     client,
		contract:   contract,
		routerAddr: routerAddr,
		prng:       prng,
		swapNonces: make(map[common.Address]*big.Int),
	}
	for i := 0; i < TraderCount; i++ {
		b.swapNonces[chain.AnvilAddress(i+3)] = big.NewInt(0)
	}
	return b, nil
}

// Seed gives each trader their initial balanceA. Call once after deployment.
func (b *SwapBot) Seed(ctx context.Context) error {
	if b.seeded {
		return nil
	}
	opts := copyOpts(b.client.Deployer())
	for i := 0; i < TraderCount; i++ {
		addr := chain.AnvilAddress(i + 3)
		_, err := b.contract.Transact(opts, "seed", addr, big.NewInt(InitialBalance))
		if err != nil {
			return err
		}
	}
	b.seeded = true
	return nil
}

// OnBlock is called for every new L2 block; submits one swap.
func (b *SwapBot) OnBlock(ctx context.Context, blockNum uint64) error {
	traderIdx := b.prng.Intn(TraderCount)
	trader := chain.AnvilAddress(traderIdx + 3)
	if err := b.syncNonce(ctx, trader); err != nil {
		return err
	}
	swapNonce := b.swapNonces[trader]

	amountIn := big.NewInt(int64(b.prng.Intn(20) + 1)) // 1–20 units

	opts := copyOpts(b.client.Trader(traderIdx))
	_, err := b.contract.Transact(opts, "swap", trader, amountIn, swapNonce)
	if err != nil {
		_ = b.syncNonce(ctx, trader)
		return err
	}
	b.swapNonces[trader] = new(big.Int).Add(swapNonce, big.NewInt(1))
	return nil
}

func (b *SwapBot) syncNonce(ctx context.Context, trader common.Address) error {
	var out []interface{}
	if err := b.contract.Call(&bind.CallOpts{Context: ctx}, &out, "nonces", trader); err != nil {
		return err
	}
	nonce, ok := out[0].(*big.Int)
	if !ok {
		return fmt.Errorf("unexpected nonces return type %T", out[0])
	}
	b.swapNonces[trader] = nonce
	return nil
}

// copyOpts returns a shallow copy so we can set Value without mutating the shared auth.
func copyOpts(auth *bind.TransactOpts) *bind.TransactOpts {
	c := *auth
	return &c
}
