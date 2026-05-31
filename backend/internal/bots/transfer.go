package bots

import (
	"context"
	"math/big"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// TransferBot emits 2–4 ETH transfers between Anvil accounts on each L1 block.
type TransferBot struct {
	client *chain.Client
	prng   *seed.PRNG
}

func NewTransferBot(client *chain.Client, prng *seed.PRNG) *TransferBot {
	return &TransferBot{client: client, prng: prng}
}

// OnBlock is called for every new L1 block.
func (b *TransferBot) OnBlock(ctx context.Context, _ uint64) error {
	// Only shuffle ETH from the deployer so we never drain sequencer/challenger/trader gas.
	count := 2 + b.prng.Intn(2) // 2–3 decorative transfers
	for i := 0; i < count; i++ {
		toIdx := 1 + b.prng.Intn(4) // accounts 1–4
		amount := new(big.Int).SetUint64(1e15 + b.prng.Uint64()%(4*1e15))
		_ = b.sendETH(ctx, 0, chain.AnvilAddress(toIdx), amount)
	}
	return nil
}

func (b *TransferBot) sendETH(ctx context.Context, fromIdx int, to common.Address, amount *big.Int) error {
	from := chain.AnvilAddress(fromIdx)

	nonce, err := b.client.EC.PendingNonceAt(ctx, from)
	if err != nil {
		return err
	}
	gasPrice, err := b.client.EC.SuggestGasPrice(ctx)
	if err != nil {
		return err
	}

	tx := types.NewTx(&types.LegacyTx{
		Nonce:    nonce,
		To:       &to,
		Value:    amount,
		Gas:      21000,
		GasPrice: gasPrice,
	})

	key, err := crypto.HexToECDSA(chain.PrivKey(fromIdx))
	if err != nil {
		return err
	}
	signer := types.NewEIP155Signer(big.NewInt(int64(b.client.Config.ChainID)))
	signed, err := types.SignTx(tx, signer, key)
	if err != nil {
		return err
	}
	return b.client.EC.SendTransaction(ctx, signed)
}
