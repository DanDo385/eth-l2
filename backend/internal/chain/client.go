package chain

import (
	"context"
	"fmt"
	"math/big"

	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/crypto"
	"github.com/ethereum/go-ethereum/ethclient"
)

// DefaultGasLimit is used for all local Anvil transactions (swap bots, sequencers, etc.).
const DefaultGasLimit = 16_000_000

// anvilKeys are the default Anvil private keys (mnemonic: test test … junk).
var anvilKeys = []string{
	"ac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", // [0] deployer
	"59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d", // [1] sequencer
	"5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // [2] challenger
	"7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6", // [3] trader-0
	"47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926b", // [4] trader-1
}

// DeployerKey returns the deployer private key hex (no 0x prefix).
func DeployerKey() string { return anvilKeys[0] }

// PrivKey returns the hex private key (no 0x) for the i-th Anvil account.
func PrivKey(i int) string { return anvilKeys[i] }

// SequencerAddr returns the sequencer's checksummed address.
func SequencerAddr() string {
	key, _ := crypto.HexToECDSA(anvilKeys[1])
	return crypto.PubkeyToAddress(key.PublicKey).Hex()
}

// AnvilAddress returns the address for the i-th default Anvil account.
func AnvilAddress(i int) common.Address {
	key, _ := crypto.HexToECDSA(anvilKeys[i])
	return crypto.PubkeyToAddress(key.PublicKey)
}

type Client struct {
	Config ChainConfig
	EC     *ethclient.Client
	auths  []*bind.TransactOpts
}

func NewClient(ctx context.Context, cfg ChainConfig) (*Client, error) {
	ec, err := ethclient.DialContext(ctx, fmt.Sprintf("http://127.0.0.1:%d", cfg.Port))
	if err != nil {
		return nil, fmt.Errorf("dial %s: %w", cfg.Name, err)
	}
	chainID := big.NewInt(int64(cfg.ChainID))
	c := &Client{Config: cfg, EC: ec}
	for _, hex := range anvilKeys {
		key, err := crypto.HexToECDSA(hex)
		if err != nil {
			ec.Close()
			return nil, fmt.Errorf("parse key: %w", err)
		}
		auth, err := bind.NewKeyedTransactorWithChainID(key, chainID)
		if err != nil {
			ec.Close()
			return nil, err
		}
		auth.GasLimit = DefaultGasLimit
		c.auths = append(c.auths, auth)
	}
	return c, nil
}

func (c *Client) Deployer() *bind.TransactOpts   { return c.auths[0] }
func (c *Client) Sequencer() *bind.TransactOpts  { return c.auths[1] }
func (c *Client) Challenger() *bind.TransactOpts { return c.auths[2] }

func (c *Client) Trader(i int) *bind.TransactOpts {
	if i < 0 || i+3 >= len(c.auths) {
		panic(fmt.Sprintf("trader index %d out of range", i))
	}
	return c.auths[i+3]
}

// Reset calls anvil_reset to wipe the chain back to genesis state.
func (c *Client) Reset(ctx context.Context) error {
	return c.EC.Client().CallContext(ctx, nil, "anvil_reset")
}

// Mine forces n blocks to be mined immediately via anvil_mine.
func (c *Client) Mine(ctx context.Context, n int) error {
	return c.EC.Client().CallContext(ctx, nil, "anvil_mine", n)
}

func (c *Client) Close() { c.EC.Close() }
