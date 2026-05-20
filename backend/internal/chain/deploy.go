package chain

import (
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
)

// Addresses holds deployed contract addresses. Fields are populated per deployment type.
type Addresses struct {
	// L1
	Portal   string `json:"portal"`
	Dispute  string `json:"disputeGame"`
	ZkRollup string `json:"zkRollup"`
	Verifier string `json:"verifier"`
	// L2 swap (DeploySwapL2)
	HonestSwapEngine string `json:"honestSwapEngine"`
	LyingObvious     string `json:"lyingSwapEngineObvious"`
	LyingSubtle      string `json:"lyingSwapEngineSubtle"`
	SwapRouter       string `json:"swapRouter"`
}

// DeployL1 runs DeployL1.s.sol and returns the deployed addresses.
func DeployL1(repoRoot string, port int) (*Addresses, error) {
	outPath := filepath.Join(repoRoot, "out", "l1-deploy.json")
	env := []string{
		"DEPLOYER_KEY=0x" + DeployerKey(),
		"SEQUENCER_ADDR=" + SequencerAddr(),
	}
	if err := runForge(repoRoot, "script/DeployL1.s.sol", port, 31337, env); err != nil {
		return nil, fmt.Errorf("DeployL1: %w", err)
	}
	return readAddresses(outPath)
}

// DeploySwapL2 runs DeploySwapL2.s.sol and returns the deployed addresses.
func DeploySwapL2(repoRoot string, port, chainID int) (*Addresses, error) {
	outPath := filepath.Join(repoRoot, "out", fmt.Sprintf("swap-l2-%d-deploy.json", chainID))
	env := []string{
		"DEPLOYER_KEY=0x" + DeployerKey(),
		"SEQUENCER_ADDR=" + SequencerAddr(),
		"DEPLOY_OUT_PATH=" + outPath,
	}
	if err := runForge(repoRoot, "script/DeploySwapL2.s.sol", port, chainID, env); err != nil {
		return nil, fmt.Errorf("DeploySwapL2 chainID=%d: %w", chainID, err)
	}
	return readAddresses(outPath)
}

func runForge(repoRoot, script string, port, chainID int, extraEnv []string) error {
	if err := os.MkdirAll(filepath.Join(repoRoot, "out"), 0o755); err != nil {
		return err
	}
	cmd := exec.Command("forge", "script", script,
		"--rpc-url", fmt.Sprintf("http://127.0.0.1:%d", port),
		"--broadcast",
		"--chain-id", fmt.Sprintf("%d", chainID),
	)
	cmd.Dir = repoRoot
	cmd.Env = append(os.Environ(), extraEnv...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("forge script %s: %w\n%s", script, err, string(out))
	}
	return nil
}

func readAddresses(path string) (*Addresses, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read %s: %w", path, err)
	}
	var addrs Addresses
	if err := json.Unmarshal(data, &addrs); err != nil {
		return nil, fmt.Errorf("parse %s: %w", path, err)
	}
	return &addrs, nil
}
