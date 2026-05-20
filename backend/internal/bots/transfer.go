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
	count := 2 + b.prng.Intn(3) // 2–4 transfers
	for i := 0; i < count; i++ {
		fromIdx := b.prng.Intn(5)
		toIdx := b.prng.Intn(4) // pick from 0-3, shift if same as from
		if toIdx >= fromIdx {
			toIdx++
		}
		// 0.001–0.005 ETH (1e15–5e15 wei)
		amount := new(big.Int).SetUint64(1e15 + b.prng.Uint64()%(4*1e15))
		// non-fatal: low balance or nonce race; just skip
		_ = b.sendETH(ctx, fromIdx, chain.AnvilAddress(toIdx), amount)
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
