package config

import (
	"path/filepath"
	"runtime"
	"testing"
)

func repoRoot(t *testing.T) string {
	t.Helper()
	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}
	return filepath.Clean(filepath.Join(filepath.Dir(file), "..", "..", ".."))
}

func TestLoadPorts(t *testing.T) {
	p, err := Load(repoRoot(t))
	if err != nil {
		t.Fatal(err)
	}
	if p.Frontend.Port != 3001 {
		t.Fatalf("frontend port = %d, want 3001", p.Frontend.Port)
	}
	if p.Backend.Port != 8080 {
		t.Fatalf("backend port = %d, want 8080", p.Backend.Port)
	}
	if p.Anvil.L1.Port != 8545 || p.Anvil.OpL2.Port != 9545 || p.Anvil.ZkL2.Port != 10545 {
		t.Fatalf("unexpected anvil ports: %+v", p.Anvil)
	}
	if got := p.BackendListenAddr(); got != "127.0.0.1:8080" {
		t.Fatalf("BackendListenAddr = %q, want 127.0.0.1:8080", got)
	}
}
