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
  ],"outputs":[],"stateMutability":"nonpayable"},
  {"type":"function","name":"nonces","inputs":[
    {"name":"trader","type":"address"}
  ],"outputs":[
    {"name":"","type":"uint256"}
  ],"stateMutability":"view"},
  {"type":"function","name":"balanceA","inputs":[
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
	opts := chain.WithGas(b.client.Deployer(), chain.GasLimitSeed)
	for i := 0; i < TraderCount; i++ {
		addr := chain.AnvilAddress(i + 3)
		if _, err := b.contract.Transact(opts, "seed", addr, big.NewInt(chain.TraderSeedBalance)); err != nil {
			return err
		}
	}
	b.seeded = true
	return nil
}

// OnBlock is called for every new L2 block; submits one swap when funded.
func (b *SwapBot) OnBlock(ctx context.Context, _ uint64) error {
	traderIdx := b.prng.Intn(TraderCount)
	trader := chain.AnvilAddress(traderIdx + 3)
	if err := b.syncNonce(ctx, trader); err != nil {
		return err
	}

	amountIn := big.NewInt(int64(b.prng.Intn(20) + 1))
	skip, err := b.ensureBalanceA(ctx, trader, amountIn)
	if err != nil {
		return err
	}
	if skip {
		return nil
	}

	opts := chain.WithGas(b.client.Trader(traderIdx), chain.GasLimitSwap)
	_, err = b.contract.Transact(opts, "swap", trader, amountIn, b.swapNonces[trader])
	if err != nil {
		if RecoverableTxErr(err) {
			_ = b.syncNonce(ctx, trader)
			return nil
		}
		return err
	}
	b.swapNonces[trader] = new(big.Int).Add(b.swapNonces[trader], big.NewInt(1))
	return nil
}

func (b *SwapBot) ensureBalanceA(ctx context.Context, trader common.Address, amountIn *big.Int) (skip bool, err error) {
	bal, err := b.readBalanceA(ctx, trader)
	if err != nil {
		return false, err
	}
	if bal.Cmp(amountIn) >= 0 {
		return false, nil
	}
	if bal.Cmp(big.NewInt(chain.TraderTopUpThreshold)) < 0 {
		opts := chain.WithGas(b.client.Deployer(), chain.GasLimitSeed)
		_, err = b.contract.Transact(opts, "seed", trader, big.NewInt(chain.TraderSeedBalance))
		return false, err
	}
	return true, nil
}

func (b *SwapBot) readBalanceA(ctx context.Context, trader common.Address) (*big.Int, error) {
	var out []interface{}
	if err := b.contract.Call(&bind.CallOpts{Context: ctx}, &out, "balanceA", trader); err != nil {
		return nil, err
	}
	bal, ok := out[0].(*big.Int)
	if !ok {
		return nil, fmt.Errorf("unexpected balanceA type %T", out[0])
	}
	return bal, nil
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

// RecoverableTxErr is true for transient local-demo failures (low balance, nonce drift, revert).
func RecoverableTxErr(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "insufficient funds") ||
		strings.Contains(msg, "insufficient a") ||
		strings.Contains(msg, "invalid nonce") ||
		strings.Contains(msg, "execution reverted")
}
