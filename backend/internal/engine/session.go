package engine

import (
	"context"
	"fmt"
	"log"
	"math/big"
	"sync"
	"time"

	"github.com/dando385/eth-l2/backend/internal/bots"
	"github.com/dando385/eth-l2/backend/internal/chain"
	"github.com/dando385/eth-l2/backend/internal/challenge"
	"github.com/dando385/eth-l2/backend/internal/events"
	"github.com/dando385/eth-l2/backend/internal/seed"
	"github.com/dando385/eth-l2/backend/internal/sequencer"
	"github.com/dando385/eth-l2/backend/internal/store"
	"github.com/dando385/eth-l2/backend/internal/watcher"
	"github.com/ethereum/go-ethereum/common"
)

type sessionState int

const (
	stateIdle sessionState = iota
	stateRunning
	statePaused
)

// batchEvery is how many L2 blocks form one batch window.
const batchEvery = 5

// Session manages the full lifecycle of one demo run.
type Session struct {
	mu       sync.Mutex
	st       sessionState
	repoRoot string

	anvils  []*chain.Anvil
	clients map[string]*chain.Client
	l1Addrs *chain.Addresses
	l2Addrs map[string]*chain.Addresses

	prng   *seed.PRNG
	speed  int
	cancel context.CancelFunc

	bus         *events.Bus
	transferBot *bots.TransferBot
	opSwapBot   *bots.SwapBot
	zkSwapBot   *bots.SwapBot
	opSeq       *sequencer.OPSequencer
	zkSeq       *sequencer.ZKSequencer
	opWatcher   *watcher.HonestWatcher
	batchStore  *store.Store
	challenger  *challenge.Challenger
}

func NewSession(repoRoot string) *Session {
	return &Session{
		repoRoot: repoRoot,
		clients:  make(map[string]*chain.Client),
		l2Addrs:  make(map[string]*chain.Addresses),
	}
}

func (s *Session) Start(ctx context.Context, seedVal uint64, speed int) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.st != stateIdle {
		return fmt.Errorf("session already active")
	}

	s.speed = speed
	s.prng = seed.New(seedVal)
	cfgs := chain.ScaledChains(speed)

	for _, cfg := range cfgs {
		a := chain.NewAnvil(cfg)
		if err := a.Start(); err != nil {
			s.teardown()
			return fmt.Errorf("spawn %s: %w", cfg.Name, err)
		}
		s.anvils = append(s.anvils, a)
	}

	for _, cfg := range cfgs {
		c, err := chain.NewClient(ctx, cfg)
		if err != nil {
			s.teardown()
			return err
		}
		s.clients[cfg.Name] = c
	}

	l1Addrs, err := chain.DeployL1(s.repoRoot, cfgs[0].Port)
	if err != nil {
		s.teardown()
		return err
	}
	s.l1Addrs = l1Addrs

	for _, cfg := range cfgs[1:] {
		addrs, err := chain.DeploySwapL2(s.repoRoot, cfg.Port, cfg.ChainID)
		if err != nil {
			s.teardown()
			return err
		}
		s.l2Addrs[cfg.Name] = addrs
	}

	if err := s.initComponents(ctx); err != nil {
		s.teardown()
		return err
	}

	tickCtx, cancel := context.WithCancel(ctx)
	s.cancel = cancel
	s.st = stateRunning
	go s.tickLoop(tickCtx)
	go s.challenger.AutoChallenge(tickCtx)
	return nil
}

func (s *Session) initComponents(ctx context.Context) error {
	s.bus = events.NewBus()
	l1c := s.clients["l1"]
	opL2c := s.clients["op-l2"]
	zkL2c := s.clients["zk-l2"]
	opAddrs := s.l2Addrs["op-l2"]
	zkAddrs := s.l2Addrs["zk-l2"]

	s.transferBot = bots.NewTransferBot(l1c, s.prng.Fork("transfer"))

	var err error
	s.opSwapBot, err = bots.NewSwapBot(opL2c, common.HexToAddress(opAddrs.SwapRouter), s.prng.Fork("op-swap"))
	if err != nil {
		return err
	}
	s.zkSwapBot, err = bots.NewSwapBot(zkL2c, common.HexToAddress(zkAddrs.SwapRouter), s.prng.Fork("zk-swap"))
	if err != nil {
		return err
	}

	if err := s.opSwapBot.Seed(ctx); err != nil {
		return fmt.Errorf("seed OP traders: %w", err)
	}
	if err := s.zkSwapBot.Seed(ctx); err != nil {
		return fmt.Errorf("seed ZK traders: %w", err)
	}

	s.opSeq = sequencer.NewOPSequencer(l1c, opL2c, s.l1Addrs, opAddrs, s.prng.Fork("op-seq"), s.bus, batchEvery)
	s.zkSeq = sequencer.NewZKSequencer(l1c, zkL2c, s.l1Addrs, zkAddrs, s.prng.Fork("zk-seq"), s.bus, batchEvery)
	s.opWatcher = watcher.NewHonestWatcher(l1c, opL2c, s.l1Addrs, opAddrs, s.bus)

	s.batchStore = store.New()
	s.challenger = challenge.New(l1c, opL2c, s.l1Addrs, opAddrs, s.batchStore, s.bus)

	return nil
}

func (s *Session) Pause() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.st != stateRunning {
		return fmt.Errorf("session not running")
	}
	s.st = statePaused
	return nil
}

func (s *Session) Resume() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.st != statePaused {
		return fmt.Errorf("session not paused")
	}
	s.st = stateRunning
	return nil
}

func (s *Session) Stop() {
	s.mu.Lock()
	cancel := s.cancel
	s.cancel = nil
	s.mu.Unlock()
	if cancel != nil {
		cancel()
	}
	s.mu.Lock()
	s.teardown()
	s.st = stateIdle
	s.mu.Unlock()
}

func (s *Session) Reseed(ctx context.Context, newSeed uint64) error {
	s.mu.Lock()
	if s.st == stateIdle {
		s.mu.Unlock()
		return fmt.Errorf("session not started")
	}
	speed := s.speed
	s.mu.Unlock()
	s.Stop()
	return s.Start(ctx, newSeed, speed)
}

func (s *Session) Bus() *events.Bus {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.bus
}

func (s *Session) Store() *store.Store {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.batchStore
}

func (s *Session) Challenger() *challenge.Challenger {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.challenger
}

func (s *Session) L1Addrs() *chain.Addresses {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.l1Addrs
}

func (s *Session) L2Addrs(name string) *chain.Addresses {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.l2Addrs[name]
}

func (s *Session) Client(name string) *chain.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.clients[name]
}

// tickLoop polls each chain every 500 ms and dispatches to bots/sequencer/watcher.
func (s *Session) tickLoop(ctx context.Context) {
	ticker := time.NewTicker(500 * time.Millisecond)
	defer ticker.Stop()
	lastBlocks := map[string]uint64{}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.mu.Lock()
			paused := s.st == statePaused
			s.mu.Unlock()
			if paused {
				continue
			}
			s.driveChains(ctx, lastBlocks)
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
			log.Printf("transferBot block %d: %v", blockNum, err)
		}

	case "op-l2":
		// 1. Swap bot submits through whatever engine is current.
		if err := s.opSwapBot.OnBlock(ctx, blockNum); err != nil {
			log.Printf("opSwapBot block %d: %v", blockNum, err)
		}

		// 2. Watcher tracks the honest state for this block's txs.
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
				log.Printf("opWatcher block %d: %v", blockNum, err)
			}
		}

		// 3. Sequencer decides if this is a batch boundary.
		result, err := s.opSeq.OnBlock(ctx, blockNum)
		if err != nil {
			log.Printf("opSeq block %d: %v", blockNum, err)
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
			log.Printf("zkSwapBot block %d: %v", blockNum, err)
		}
		s.zkSeq.OnBlock(ctx, blockNum)
	}
}

func (s *Session) teardown() {
	for _, a := range s.anvils {
		a.Stop()
	}
	s.anvils = nil
	for _, c := range s.clients {
		c.Close()
	}
	s.clients = make(map[string]*chain.Client)
	s.l1Addrs = nil
	s.l2Addrs = make(map[string]*chain.Addresses)
	s.transferBot = nil
	s.opSwapBot = nil
	s.zkSwapBot = nil
	s.opSeq = nil
	s.zkSeq = nil
	s.opWatcher = nil
	s.batchStore = nil
	s.challenger = nil
	s.bus = nil
}

// blockData adapts go-ethereum block tx data to watcher.blockReader.
type blockData struct {
	txs []watcher.TxData
}

func (b *blockData) Txs() []watcher.TxData { return b.txs }
