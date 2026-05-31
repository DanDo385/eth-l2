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
    {"name":"proof","type":"bytes"}
  ],"outputs":[{"name":"accepted","type":"bool"}],"stateMutability":"nonpayable"}
]`

// zkBatchSubmittedTopic is keccak256("ZkBatchSubmitted(uint64,bytes32,bytes32,uint32,bool,uint256)")
var zkBatchSubmittedTopic = crypto.Keccak256Hash([]byte("ZkBatchSubmitted(uint64,bytes32,bytes32,uint32,bool,uint256)"))

// ZKSequencer submits real ZK batches to the ZkRollupMock contract on L1.
// It reads the L2 state root, crafts a deterministic accepting proof,
// submits on-chain, and publishes ZkInspectReady with real verificationGasUsed.
type ZKSequencer struct {
	l1Client   *chain.Client
	l2Client   *chain.Client
	prng       *seed.PRNG
	bus        *events.Bus
	batchEvery int
	routerAddr common.Address

	zkRollup *bind.BoundContract
	router   *bind.BoundContract

	nextBatchID     uint64
	windowStart     uint64
	prevStateRoot   [32]byte
	pendingTxHashes []common.Hash
}

func NewZKSequencer(
	l1Client, l2Client *chain.Client,
	l1Addrs, l2Addrs *chain.Addresses,
	prng *seed.PRNG,
	bus *events.Bus,
	batchEvery int,
) *ZKSequencer {
	zkABI, _ := abi.JSON(strings.NewReader(zkRollupABIStr))
	routerABIParsed, _ := abi.JSON(strings.NewReader(routerABI))

	zkContract := bind.NewBoundContract(
		common.HexToAddress(l1Addrs.ZkRollup), zkABI,
		l1Client.EC, l1Client.EC, l1Client.EC,
	)
	routerContract := bind.NewBoundContract(
		common.HexToAddress(l2Addrs.SwapRouter), routerABIParsed,
		l2Client.EC, l2Client.EC, l2Client.EC,
	)

	return &ZKSequencer{
		l1Client:   l1Client,
		l2Client:   l2Client,
		prng:       prng,
		bus:        bus,
		batchEvery: batchEvery,
		routerAddr: common.HexToAddress(l2Addrs.SwapRouter),
		zkRollup:   zkContract,
		router:     routerContract,
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
				s.pendingTxHashes = append(s.pendingTxHashes, tx.Hash())
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
	// Read the honest state root from the ZK-L2 router.
	var rootOut []interface{}
	if err := s.router.Call(&bind.CallOpts{Context: ctx}, &rootOut, "stateRoot"); err != nil {
		return fmt.Errorf("read stateRoot: %w", err)
	}
	postStateRoot := rootOut[0].([32]byte)

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

	// Find a proof the VerifierMock accepts: keccak256(proof||headerHash)[0] < 0x80
	headerHash := hashBatchHeader(header)
	var proof []byte
	var simulateInvalid bool
	// ~25% of batches demo a rejected proof (contrast with OP's challenge window).
	derived := s.prng.KeccakDerive(fmt.Sprintf("zk-valid:%d", batchID))
	choice := binary.BigEndian.Uint64(derived[:8]) % 4
	if choice == 0 {
		proof = s.findRejectingProof(headerHash)
		simulateInvalid = true
	} else {
		proof = s.findAcceptingProof(headerHash)
	}

	opts := copyOpts(s.l1Client.Sequencer())
	tx, err := s.zkRollup.Transact(opts, "submitBatch", header, proof)
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

	// Constraint count and prove time are simulated (a real prover would report these).
	txCount := len(s.pendingTxHashes)
	constraints := 48_000 + txCount*8_500
	proveMs := int64(180 + txCount*45)

	s.bus.Publish(events.New(events.ZkInspectReady, events.ZkInspectReadyPayload{
		BatchID:     batchID,
		L2EndBlock:  l2EndBlock,
		Constraints: constraints,
		ProveMs:     proveMs,
		VerifyGas:   verifyGas,
		Accepted:    accepted,
		Reason:      zkRejectReason(simulateInvalid, accepted),
	}))

	s.nextBatchID++
	s.prevStateRoot = postStateRoot
	s.windowStart = 0
	s.pendingTxHashes = nil
	return nil
}

// hashBatchHeader mirrors Hashing.hashBatchHeader: keccak256(abi.encode(header)).
// abi.encode packs each field right-aligned in a 32-byte slot.
func hashBatchHeader(h BatchHeader) [32]byte {
	buf := make([]byte, 256) // 8 fields × 32 bytes
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

// findRejectingProof searches for a 40-byte proof the VerifierMock rejects.
func (s *ZKSequencer) findRejectingProof(headerHash [32]byte) []byte {
	base := s.prng.KeccakDerive(fmt.Sprintf("zk-bad-proof:%d", s.nextBatchID))
	for nonce := uint64(0); ; nonce++ {
		proof := make([]byte, 40)
		copy(proof[:32], base[:])
		binary.BigEndian.PutUint64(proof[32:], nonce)
		if crypto.Keccak256(proof, headerHash[:])[0] >= 0x80 {
			return proof
		}
	}
}

func zkRejectReason(simulatedInvalid, accepted bool) string {
	if accepted {
		return "Proof verified on L1 — batch finalized immediately with no challenge window."
	}
	if simulatedInvalid {
		return "Invalid proof — L1 verifier rejected this batch. Fraudulent state never entered the chain."
	}
	return "Proof verification failed on L1."
}

// findAcceptingProof searches for a 40-byte proof the VerifierMock accepts.
// VerifierMock: valid = keccak256(abi.encodePacked(proof, pubInputHash))[0] < 0x80
// Expected iterations: ~2 on average (50% acceptance rate per try).
func (s *ZKSequencer) findAcceptingProof(headerHash [32]byte) []byte {
	base := s.prng.KeccakDerive(fmt.Sprintf("zk-proof:%d", s.nextBatchID))
	for nonce := uint64(0); ; nonce++ {
		proof := make([]byte, 40)
		copy(proof[:32], base[:])
		binary.BigEndian.PutUint64(proof[32:], nonce)
		if crypto.Keccak256(proof, headerHash[:])[0] < 0x80 {
			return proof
		}
	}
}

// parseZkBatchSubmitted extracts accepted and verificationGasUsed from the ZkBatchSubmitted event.
// Event data layout (non-indexed): headerHash(32) | postStateRoot(32) | txCount(32) | accepted(32) | gasUsed(32)
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
