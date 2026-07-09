package engine

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"time"

	"github.com/dando385/eth-l2/backend/internal/bots"
	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/dando385/eth-l2/backend/internal/watcher"
)

// tickLoop polls each chain every 500 ms and dispatches to bots/sequencer/watcher.
// On the first tick after resuming from pause, lastBlocks is advanced to the current
// chain tips without firing onBlock, preventing a burst of stale callbacks.
func (s *Session) tickLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	lastBlocks := map[string]uint64{}
	s.advanceLastBlocks(ctx, lastBlocks)
	wasJustPaused := false

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mu.Lock()
			paused := s.st == statePaused
			s.mu.Unlock()
			if paused {
				wasJustPaused = true
				continue
			}
			if wasJustPaused {
				wasJustPaused = false
				s.advanceLastBlocks(ctx, lastBlocks)
				continue
			}
			s.driveChains(ctx, lastBlocks)
		}
	}
}

// advanceLastBlocks moves lastBlocks to current chain tips without firing onBlock.
func (s *Session) advanceLastBlocks(ctx context.Context, lastBlocks map[string]uint64) {
	for _, name := range []string{"l1", "op-l2", "zk-l2"} {
		c := s.Client(name)
		if c == nil {
			continue
		}
		if blockNum, err := c.EC.BlockNumber(ctx); err == nil {
			lastBlocks[name] = blockNum
		}
	}
}

func (s *Session) driveChains(ctx context.Context, lastBlocks map[string]uint64) {
	for _, name := range []string{"l1", "op-l2", "zk-l2"} {
		c := s.Client(name)
		if c == nil {
			continue
		}
		blockNum, err := c.EC.BlockNumber(ctx)
		if err != nil {
			continue
		}
		for b := lastBlocks[name] + 1; b <= blockNum; b++ {
			s.onBlock(ctx, name, b)
		}
		lastBlocks[name] = blockNum
	}
}

func (s *Session) onBlock(ctx context.Context, chainName string, blockNum uint64) {
	switch chainName {
	case "l1":
		s.publishBlock(chainName, blockNum)
		if err := s.transferBot.OnBlock(ctx, blockNum); err != nil {
			s.reportBotError("l1", "transferBot", blockNum, err)
		}
		s.finalizeHonestBatches(ctx)
		s.armL2IfNeeded(ctx)

	case "op-l2":
		if !s.l2Armed || blockNum <= s.opL2Origin {
			return
		}
		s.publishBlock(chainName, relBlock(blockNum, s.opL2Origin))
		if err := s.opSwapBot.OnBlock(ctx, blockNum); err != nil {
			s.reportBotError("op-l2", "opSwapBot", blockNum, err)
		}

		blk, err := s.clients["op-l2"].EC.BlockByNumber(ctx, big.NewInt(int64(blockNum)))
		if err == nil {
			txData := make([]watcher.TxData, 0, len(blk.Transactions()))
			for _, tx := range blk.Transactions() {
				to := tx.To()
				data := make([]byte, len(tx.Data()))
				copy(data, tx.Data())
				txData = append(txData, watcher.TxData{To: to, Data: data})
			}
			if err := s.opWatcher.OnL2Block(ctx, blockNum, &blockData{txData}); err != nil {
				s.reportBotError("op-l2", "opWatcher", blockNum, err)
			}
		}

		result, err := s.opSeq.OnBlock(ctx, blockNum)
		if err != nil {
			s.reportBotError("op-l2", "opSeq", blockNum, err)
		}
		if result != nil {
			s.batchStore.AddBatch(&store.BatchInfo{
				BatchID:       result.BatchID,
				TxHashes:      result.TxHashes,
				Swaps:         result.Swaps,
				EngineType:    result.EngineType,
				PostStateRoot: fmt.Sprintf("0x%x", result.PostStateRoot),
				L2StartBlock:  result.L2StartBlock,
				L2EndBlock:    result.L2EndBlock,
				TxCount:       result.TxCount,
				SubmittedAt:   time.Now().Unix(),
			})
			s.opWatcher.CheckBatch(result)
		}

	case "zk-l2":
		if !s.l2Armed || blockNum <= s.zkL2Origin {
			return
		}
		s.publishBlock(chainName, relBlock(blockNum, s.zkL2Origin))
		// Re-fund ZK accounts every 20 blocks so long-running demos don't run dry.
		// (EnsureDemoBalances is also called at session start, but Anvil's internal
		// state can diverge from what was set when the chain processes many txs.)
		if blockNum%20 == 0 {
			if zkClient := s.clients["zk-l2"]; zkClient != nil {
				if err := zkClient.EnsureDemoBalances(ctx); err != nil {
					log.Printf("zk-l2 refund: %v", err)
				}
			}
		}
		if err := s.zkSwapBot.OnBlock(ctx, blockNum); err != nil {
			// ZK lane is a contrast demo; log locally without hijacking the OP error banner.
			if !bots.RecoverableTxErr(err) {
				log.Printf("zk-l2 swap block %d: %v", blockNum, err)
			}
		}
		s.zkSeq.OnBlock(ctx, blockNum)
	}
}

func (s *Session) publishBlock(chainName string, blockNum uint64) {
	s.bus.Publish(events.New(events.BlockMined, events.BlockMinedPayload{
		Chain: chainName, BlockNum: blockNum,
	}))
	s.batchStore.SetBlock(chainName, blockNum)
}

func relBlock(abs, origin uint64) uint64 {
	if abs <= origin {
		return 0
	}
	return abs - origin - 1
}

// armL2IfNeeded opens L2 swap/batch collection after the first post-start L1
// block. Deploy/seed blocks mined before that are excluded from demo numbering
// so batch 0 starts at relative L2 block 0.
func (s *Session) armL2IfNeeded(ctx context.Context) {
	if s.l2Armed {
		return
	}
	opTip, err := s.clients["op-l2"].EC.BlockNumber(ctx)
	if err != nil {
		s.reportBotError("op-l2", "armL2", 0, err)
		return
	}
	zkTip, err := s.clients["zk-l2"].EC.BlockNumber(ctx)
	if err != nil {
		s.reportBotError("zk-l2", "armL2", 0, err)
		return
	}
	s.opL2Origin = opTip
	s.zkL2Origin = zkTip
	s.opSeq.Arm(opTip)
	s.zkSeq.Arm(zkTip)
	s.l2Armed = true
}

func (s *Session) reportBotError(chainName, component string, blockNum uint64, err error) {
	msg := fmt.Sprintf("%s block %d: %v", component, blockNum, err)
	if bots.RecoverableTxErr(err) {
		log.Printf("[%s] %s", chainName, msg)
		return
	}
	s.publishError(chainName, msg)
}

func (s *Session) publishError(chain, msg string) {
	s.bus.Publish(events.New(events.ErrorOccurred, events.ErrorPayload{
		Chain:   chain,
		Message: msg,
	}))
}

// finalizeHonestBatches returns sequencer bonds for honest batches once the
// on-chain challenge window closes (WO-6). Best-effort: reverts until L1 time
// has advanced far enough are ignored.
func (s *Session) finalizeHonestBatches(ctx context.Context) {
	if s.challenger == nil || s.batchStore == nil {
		return
	}
	now := time.Now().Unix()
	for _, id := range s.batchStore.UnfinalizedUnchallenged(now, chain.ChallengeWindowSeconds) {
		if err := s.challenger.FinalizeUnchallenged(ctx, id); err != nil {
			log.Printf("finalize batch %d: %v", id, err)
		}
	}
}

// blockData adapts go-ethereum block tx data to watcher.blockReader.
type blockData struct {
	txs []watcher.TxData
}

func (b *blockData) Txs() []watcher.TxData { return b.txs }
