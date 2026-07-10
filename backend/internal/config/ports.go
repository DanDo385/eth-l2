package config

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
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
		Bind   string `json:"bind"`
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
	Staging struct {
		PublicAPIOrigin string `json:"publicApiOrigin"`
		VercelOrigin    string `json:"vercelOrigin"`
		TunnelService   string `json:"tunnelService"`
	} `json:"staging"`
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

// BackendListenAddr returns the default HTTP bind address from ports.json.
// Prefer loopback so the API is only reachable via localhost / Cloudflare Tunnel,
// never by binding all interfaces by accident.
func (p *Ports) BackendListenAddr() string {
	if bind := strings.TrimSpace(p.Backend.Bind); bind != "" {
		return bind
	}
	host := strings.TrimSpace(p.Backend.Host)
	if host == "" || host == "0.0.0.0" || host == "::" {
		host = "127.0.0.1"
	}
	return fmt.Sprintf("%s:%d", host, p.Backend.Port)
}
