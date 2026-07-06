package sequencer

import (
	"context"
	"encoding/binary"
	"fmt"
	"log"
	"math/big"
	"strings"
	"time"

	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/ethereum/go-ethereum/accounts/abi"
	"github.com/ethereum/go-ethereum/accounts/abi/bind"
	"github.com/ethereum/go-ethereum/common"
	"github.com/ethereum/go-ethereum/core/types"
	"github.com/ethereum/go-ethereum/crypto"
)

// New ZK rollup ABI: submitBatch takes the header plus a validity witness
// (pre-state accounts + the batch swaps). The on-chain ZkValidityVerifier
// re-executes honestly and accepts only if the claimed post root matches.
const zkRollupABIStr = `[
  {"type":"function","name":"submitBatch","inputs":[
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
    {"name":"pre","type":"tuple[]","components":[
      {"name":"account","type":"address"},
      {"name":"balanceA","type":"uint256"},
      {"name":"balanceB","type":"uint256"},
      {"name":"nonce","type":"uint256"}
    ]},
    {"name":"swaps","type":"tuple[]","components":[
      {"name":"trader","type":"address"},
      {"name":"amountIn","type":"uint256"},
      {"name":"nonce","type":"uint256"}
    ]}
  ],"outputs":[{"name":"accepted","type":"bool"}],"stateMutability":"nonpayable"}
]`

const zkSwapDecodeABI = `[
  {"type":"function","name":"swap","inputs":[
    {"name":"trader","type":"address"},
    {"name":"amountIn","type":"uint256"},
    {"name":"nonce","type":"uint256"}
  ],"outputs":[
    {"name":"swapId","type":"uint64"},
    {"name":"amountOut","type":"uint256"}
  ],"stateMutability":"nonpayable"}
]`

// zkBatchSubmittedTopic is keccak256("ZkBatchSubmitted(uint64,bytes32,bytes32,uint32,bool,uint256)")
var zkBatchSubmittedTopic = crypto.Keccak256Hash([]byte("ZkBatchSubmitted(uint64,bytes32,bytes32,uint32,bool,uint256)"))

// zkAccountState / zkSwapOp mirror ZkValidityVerifier's structs for ABI packing.
type zkAccountState struct {
	Account  common.Address
	BalanceA *big.Int
	BalanceB *big.Int
	Nonce    *big.Int
}

type zkSwapOp struct {
	Trader   common.Address
	AmountIn *big.Int
	Nonce    *big.Int
}

// ZKSequencer posts real ZK batches to ZkRollupMock. It keeps an authoritative
// honest ledger (the canonical ZK state), and for each batch submits a claimed
// post-state root plus a validity witness. Honest batches carry the true root
// and verify; for "obvious"/"subtle"/"buggy" batches the sequencer instead
// posts the root a lying or buggy sequencer would compute, and the on-chain
// verifier rejects it by independent honest re-execution.
//
// Design note (WO-2): the ZK L2 chain runs the honest engine, and fraud is
// injected at the CLAIMED root the sequencer posts, not by corrupting L2 state.
// A malicious/buggy sequencer's on-chain artifact is exactly a wrong postStateRoot,
// which is what the verifier rejects, so this is faithful to the mechanism and,
// unlike hot-swapping a lying engine on L2, keeps the lane continuous with no
// rejected-batch state to roll back.
type ZKSequencer struct {
	l1Client   *chain.Client
	l2Client   *chain.Client
	prng       *seed.PRNG
	bus        *events.Bus
	batchEvery int
	routerAddr common.Address

	zkRollup *bind.BoundContract
	swapABI  abi.ABI
	ledger   *zkLedger

	nextBatchID   uint64
	windowStart   uint64
	pendingTxHash []common.Hash
}

func NewZKSequencer(
	l1Client, l2Client *chain.Client,
	l1Addrs, l2Addrs *chain.Addresses,
	prng *seed.PRNG,
	bus *events.Bus,
	batchEvery int,
) *ZKSequencer {
	zkABI, _ := abi.JSON(strings.NewReader(zkRollupABIStr))
	swapABI, _ := abi.JSON(strings.NewReader(zkSwapDecodeABI))

	zkContract := bind.NewBoundContract(
		common.HexToAddress(l1Addrs.ZkRollup), zkABI,
		l1Client.EC, l1Client.EC, l1Client.EC,
	)

	traders := []common.Address{chain.AnvilAddress(3), chain.AnvilAddress(4)}

	return &ZKSequencer{
		l1Client:   l1Client,
		l2Client:   l2Client,
		prng:       prng,
		bus:        bus,
		batchEvery: batchEvery,
		routerAddr: common.HexToAddress(l2Addrs.SwapRouter),
		zkRollup:   zkContract,
		swapABI:    swapABI,
		ledger:     newZkLedger(traders, chain.ZKTraderSeedBalance),
	}
}

// OnBlock is called for each new ZK-L2 block.
func (s *ZKSequencer) OnBlock(ctx context.Context, blockNum uint64) {
	if s.windowStart == 0 {
		s.windowStart = blockNum
	}

	block, err := s.l2Client.EC.BlockByNumber(ctx, big.NewInt(int64(blockNum)))
	if err == nil {
		for _, tx := range block.Transactions() {
			if isSwapTx(tx.To(), tx.Data(), s.routerAddr) {
				s.pendingTxHash = append(s.pendingTxHash, tx.Hash())
			}
		}
	}

	if int(blockNum-s.windowStart)+1 >= s.batchEvery {
		if err := s.postBatch(ctx, blockNum); err != nil {
			log.Printf("zkSeq postBatch: %v", err)
		}
	}
}

func (s *ZKSequencer) postBatch(ctx context.Context, l2EndBlock uint64) error {
	batchID := s.nextBatchID
	windowStart := s.windowStart

	// Reset window state up front so a mid-function error can't wedge the lane.
	s.nextBatchID++
	s.windowStart = 0
	txHashes := s.pendingTxHash
	s.pendingTxHash = nil

	// 1. Decode the successful swaps in this window (in execution order).
	swaps, err := s.collectSwaps(ctx, txHashes)
	if err != nil {
		return fmt.Errorf("collect swaps: %w", err)
	}

	// 2. Witness pre-state = the canonical ledger before this batch.
	prevRoot := s.ledger.root()
	pre := s.ledger.snapshot()

	// 3. Compute the claimed post root. Honest batches carry the true root;
	//    fraud/bug batches carry what that engine would have produced.
	mode := s.chooseMode(batchID)
	claimedPost := s.ledger.projectedRoot(swaps, "honest")
	if mode != "honest" {
		claimedPost = s.ledger.projectedRoot(swaps, mode)
	}

	// 4. Build and submit the batch. The on-chain verifier decides accept/reject.
	header := BatchHeader{
		BatchId:       batchID,
		PrevStateRoot: prevRoot,
		PostStateRoot: claimedPost,
		BatchDataHash: batchDataHash(txHashes),
		L2StartBlock:  windowStart,
		L2EndBlock:    l2EndBlock,
		TxCount:       uint32(len(swaps)),
		Timestamp:     uint64(time.Now().Unix()),
	}

	opts := chain.WithGas(copyOpts(s.l1Client.Sequencer()), chain.GasLimitL1Portal)
	tx, err := s.zkRollup.Transact(opts, "submitBatch", header, s.toWitnessAccounts(pre), s.toWitnessSwaps(swaps))
	if err != nil {
		return fmt.Errorf("submitBatch tx: %w", err)
	}
	if err := s.l1Client.Mine(ctx, 1); err != nil {
		return fmt.Errorf("mine: %w", err)
	}
	receipt, err := bind.WaitMined(ctx, s.l1Client.EC, tx)
	if err != nil {
		return fmt.Errorf("waitMined: %w", err)
	}
	accepted, verifyGas := parseZkBatchSubmitted(receipt)

	// 5. Advance the canonical ledger honestly. The honest transition is
	//    canonical regardless of whether the sequencer's CLAIM was accepted:
	//    a rejected fraud claim does not un-happen the honest swaps, it just
	//    fails to settle that batch's (bad) root.
	s.ledger.applyBatch(swaps, "honest")

	// 6. Publish. verifyGas is real (measured on L1); constraints/proveMs are
	//    a labeled simulation of what a real prover would report.
	txCount := len(swaps)
	s.bus.Publish(events.New(events.ZkInspectReady, events.ZkInspectReadyPayload{
		BatchID:     batchID,
		L2EndBlock:  l2EndBlock,
		Constraints: 48_000 + txCount*8_500,
		ProveMs:     int64(180 + txCount*45),
		VerifyGas:   verifyGas,
		Accepted:    accepted,
		Reason:      zkRejectReason(mode, accepted),
		EngineType:  mode,
		TxCount:     txCount,
	}))
	return nil
}

// collectSwaps decodes the successful swap txs (skips reverted ones) so the
// witness stays consistent with the ledger's nonce/balance tracking.
func (s *ZKSequencer) collectSwaps(ctx context.Context, hashes []common.Hash) ([]decodedSwap, error) {
	out := make([]decodedSwap, 0, len(hashes))
	for _, h := range hashes {
		receipt, err := s.l2Client.EC.TransactionReceipt(ctx, h)
		if err != nil || receipt.Status != types.ReceiptStatusSuccessful {
			continue
		}
		tx, _, err := s.l2Client.EC.TransactionByHash(ctx, h)
		if err != nil {
			continue
		}
		sw, err := s.decodeSwap(tx.Data())
		if err != nil {
			continue
		}
		out = append(out, sw)
	}
	return out, nil
}

type decodedSwap struct {
	trader   common.Address
	amountIn *big.Int
	nonce    *big.Int
}

func (s *ZKSequencer) decodeSwap(data []byte) (decodedSwap, error) {
	if len(data) < 4 {
		return decodedSwap{}, fmt.Errorf("short calldata")
	}
	args, err := s.swapABI.Methods["swap"].Inputs.Unpack(data[4:])
	if err != nil {
		return decodedSwap{}, err
	}
	if len(args) != 3 {
		return decodedSwap{}, fmt.Errorf("expected 3 args, got %d", len(args))
	}
	trader, _ := args[0].(common.Address)
	amountIn, _ := args[1].(*big.Int)
	nonce, _ := args[2].(*big.Int)
	if amountIn == nil || nonce == nil {
		return decodedSwap{}, fmt.Errorf("bad swap args")
	}
	return decodedSwap{trader: trader, amountIn: amountIn, nonce: nonce}, nil
}

func (s *ZKSequencer) toWitnessAccounts(pre []ledgerAccount) []zkAccountState {
	out := make([]zkAccountState, len(pre))
	for i, a := range pre {
		out[i] = zkAccountState{Account: a.addr, BalanceA: a.balanceA, BalanceB: a.balanceB, Nonce: a.nonce}
	}
	return out
}

func (s *ZKSequencer) toWitnessSwaps(swaps []decodedSwap) []zkSwapOp {
	out := make([]zkSwapOp, len(swaps))
	for i, sw := range swaps {
		out[i] = zkSwapOp{Trader: sw.trader, AmountIn: sw.amountIn, Nonce: sw.nonce}
	}
	return out
}

// chooseMode picks the claim the sequencer posts. Invalid claims occur at about
// 1/60, half the optimistic fault rate, and are rejected by validity checking.
func (s *ZKSequencer) chooseMode(batchID uint64) string {
	derived := s.prng.KeccakDerive(fmt.Sprintf("zk-mode:%d", batchID))
	if binary.BigEndian.Uint64(derived[:8])%ZKSuspicionDenominator != 0 {
		return "honest"
	}
	switch derived[8] % 3 {
	case 0:
		return "obvious"
	case 1:
		return "subtle"
	default:
		return "buggy"
	}
}

func zkRejectReason(mode string, accepted bool) string {
	if accepted {
		return "Proof verified on L1 by re-execution. Batch finalized immediately with no challenge window."
	}
	switch mode {
	case "obvious":
		return "Invalid post-state root (obvious lie: doubled output). L1 verifier rejected it. Fraudulent state never entered the chain."
	case "subtle":
		return "Invalid post-state root (subtle lie: skipped fee). L1 verifier rejected it. Fraudulent state never entered the chain."
	case "buggy":
		return "Invalid post-state root (honest-intent bug: truncated output). L1 verifier rejected it. A bug is rejected exactly like a lie."
	default:
		return "Post-state root did not match honest re-execution. L1 verifier rejected this batch."
	}
}

// hashBatchHeader mirrors Hashing.hashBatchHeader: keccak256(abi.encode(header)).
func hashBatchHeader(h BatchHeader) [32]byte {
	buf := make([]byte, 256)
	binary.BigEndian.PutUint64(buf[24:32], h.BatchId)
	copy(buf[32:64], h.PrevStateRoot[:])
	copy(buf[64:96], h.PostStateRoot[:])
	copy(buf[96:128], h.BatchDataHash[:])
	binary.BigEndian.PutUint64(buf[152:160], h.L2StartBlock)
	binary.BigEndian.PutUint64(buf[184:192], h.L2EndBlock)
	binary.BigEndian.PutUint32(buf[220:224], h.TxCount)
	binary.BigEndian.PutUint64(buf[248:256], h.Timestamp)
	var out [32]byte
	copy(out[:], crypto.Keccak256(buf))
	return out
}

func batchDataHash(hashes []common.Hash) [32]byte {
	var out [32]byte
	copy(out[:], crypto.Keccak256(packHashes(hashes)))
	return out
}

// parseZkBatchSubmitted extracts accepted and verificationGasUsed from the event.
// Data layout (non-indexed): headerHash(32) | postStateRoot(32) | txCount(32) | accepted(32) | gasUsed(32)
func parseZkBatchSubmitted(receipt *types.Receipt) (accepted bool, gasUsed uint64) {
	if receipt == nil {
		return
	}
	for _, l := range receipt.Logs {
		if len(l.Topics) > 0 && l.Topics[0] == zkBatchSubmittedTopic {
			if len(l.Data) >= 160 {
				accepted = l.Data[127] != 0
				gasUsed = new(big.Int).SetBytes(l.Data[128:160]).Uint64()
			}
			return
		}
	}
	return
}
