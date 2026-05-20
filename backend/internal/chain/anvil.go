package chain

import (
	"fmt"
	"net"
	"os"
	"os/exec"
	"time"
)

type ChainConfig struct {
	Name      string
	Port      int
	ChainID   int
	BlockTime int // seconds
}

// Chains are the three default local chains.
var Chains = []ChainConfig{
	{Name: "l1", Port: 8545, ChainID: 31337, BlockTime: 12},
	{Name: "op-l2", Port: 9545, ChainID: 31338, BlockTime: 2},
	{Name: "zk-l2", Port: 10545, ChainID: 31339, BlockTime: 2},
}

// ScaledChains returns configs with block times divided by speed (minimum 1 s).
func ScaledChains(speed int) []ChainConfig {
	if speed < 1 {
		speed = 1
	}
	out := make([]ChainConfig, len(Chains))
	for i, c := range Chains {
		out[i] = c
		t := c.BlockTime / speed
		if t < 1 {
			t = 1
		}
		out[i].BlockTime = t
	}
	return out
}

type Anvil struct {
	Config ChainConfig
	cmd    *exec.Cmd
}

func NewAnvil(cfg ChainConfig) *Anvil {
	return &Anvil{Config: cfg}
}

func (a *Anvil) Start() error {
	if err := checkPortFree(a.Config.Port); err != nil {
		return err
	}
	args := []string{
		"--port", fmt.Sprintf("%d", a.Config.Port),
		"--chain-id", fmt.Sprintf("%d", a.Config.ChainID),
		"--steps-tracing", // mandatory: without this, debug_traceTransaction returns empty structLogs
		"--block-time", fmt.Sprintf("%d", a.Config.BlockTime),
		"--silent",
	}
	a.cmd = exec.Command("anvil", args...)
	a.cmd.Stdout = os.Stderr // route to stderr so server logs stay clean
	a.cmd.Stderr = os.Stderr
	if err := a.cmd.Start(); err != nil {
		return fmt.Errorf("start anvil %s: %w", a.Config.Name, err)
	}
	return waitReady(a.Config.Port, 15*time.Second)
}

func (a *Anvil) Stop() {
	if a.cmd != nil && a.cmd.Process != nil {
		_ = a.cmd.Process.Kill()
		_ = a.cmd.Wait()
	}
}

func checkPortFree(port int) error {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		return fmt.Errorf("port %d already in use; stop the existing process before starting", port)
	}
	ln.Close()
	return nil
}

func waitReady(port int, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		conn, err := net.DialTimeout("tcp", fmt.Sprintf("127.0.0.1:%d", port), 200*time.Millisecond)
		if err == nil {
			conn.Close()
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
	return fmt.Errorf("anvil on port %d did not become ready within %s", port, timeout)
}
