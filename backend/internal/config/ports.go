package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
)

// Ports is the canonical dev port map (config/ports.json).
type Ports struct {
	Project string `json:"project"`
	Frontend struct {
		Host string `json:"host"`
		Port int    `json:"port"`
		URL  string `json:"url"`
	} `json:"frontend"`
	Backend struct {
		Host   string `json:"host"`
		Port   int    `json:"port"`
		URL    string `json:"url"`
		WSPath string `json:"wsPath"`
	} `json:"backend"`
	Anvil struct {
		L1 struct {
			Port    int    `json:"port"`
			ChainID int    `json:"chainId"`
			RPC     string `json:"rpc"`
		} `json:"l1"`
		OpL2 struct {
			Port    int    `json:"port"`
			ChainID int    `json:"chainId"`
			RPC     string `json:"rpc"`
		} `json:"opL2"`
		ZkL2 struct {
			Port    int    `json:"port"`
			ChainID int    `json:"chainId"`
			RPC     string `json:"rpc"`
		} `json:"zkL2"`
	} `json:"anvil"`
}

// Load reads config/ports.json under repoRoot.
func Load(repoRoot string) (*Ports, error) {
	path := filepath.Join(repoRoot, "config", "ports.json")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read ports config: %w", err)
	}
	var p Ports
	if err := json.Unmarshal(data, &p); err != nil {
		return nil, fmt.Errorf("parse ports config: %w", err)
	}
	return &p, nil
}

// BackendListenAddr returns the default HTTP bind address from ports.json (:port).
func (p *Ports) BackendListenAddr() string {
	return fmt.Sprintf(":%d", p.Backend.Port)
}
