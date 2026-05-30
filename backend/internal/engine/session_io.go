package engine

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"time"

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
	s.bus.Publish(events.New(events.BlockMined, events.BlockMinedPayload{
		Chain: chainName, BlockNum: blockNum,
	}))
	s.batchStore.SetBlock(chainName, blockNum)

	switch chainName {
	case "l1":
		if err := s.transferBot.OnBlock(ctx, blockNum); err != nil {
			s.publishError("l1", fmt.Sprintf("transferBot block %d: %v", blockNum, err))
		}

	case "op-l2":
		if err := s.opSwapBot.OnBlock(ctx, blockNum); err != nil {
			s.publishError("op-l2", fmt.Sprintf("opSwapBot block %d: %v", blockNum, err))
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
				s.publishError("op-l2", fmt.Sprintf("opWatcher block %d: %v", blockNum, err))
			}
		}

		result, err := s.opSeq.OnBlock(ctx, blockNum)
		if err != nil {
			s.publishError("op-l2", fmt.Sprintf("opSeq block %d: %v", blockNum, err))
		}
		if result != nil {
			s.batchStore.AddBatch(&store.BatchInfo{
				BatchID:       result.BatchID,
				TxHashes:      result.TxHashes,
				EngineType:    result.EngineType,
				PostStateRoot: fmt.Sprintf("0x%x", result.PostStateRoot),
				L2StartBlock:  result.L2StartBlock,
				L2EndBlock:    result.L2EndBlock,
				TxCount:       result.TxCount,
			})
			s.opWatcher.CheckBatch(result)
		}

	case "zk-l2":
		if err := s.zkSwapBot.OnBlock(ctx, blockNum); err != nil {
			// ZK lane is a contrast demo; log locally without hijacking the OP error banner.
			log.Printf("zk-l2 swap block %d: %v", blockNum, err)
		}
		s.zkSeq.OnBlock(ctx, blockNum)
	}
}

func (s *Session) publishError(chain, msg string) {
	s.bus.Publish(events.New(events.ErrorOccurred, events.ErrorPayload{
		Chain:   chain,
		Message: msg,
	}))
}

// blockData adapts go-ethereum block tx data to watcher.blockReader.
type blockData struct {
	txs []watcher.TxData
}

func (b *blockData) Txs() []watcher.TxData { return b.txs }
