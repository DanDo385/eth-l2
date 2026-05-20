package engine

import (
	"context"
	"fmt"

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
