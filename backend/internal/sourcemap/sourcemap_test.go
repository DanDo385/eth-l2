package sourcemap

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// repoRoot walks up from the test's working directory to the repo root
// (the directory containing foundry.toml).
func repoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 8; i++ {
		if _, err := os.Stat(filepath.Join(dir, "foundry.toml")); err == nil {
			return dir
		}
		dir = filepath.Dir(dir)
	}
	t.Skip("repo root (foundry.toml) not found; skipping source-map test")
	return ""
}

// resolveContains reports whether any instruction in the engine resolves to a
// source line containing want. This exercises the full pipeline: source-map
// parse, pc walk, file-index resolution, and source slicing against the real
// compiled artifact.
func resolveContains(t *testing.T, contract, want string) bool {
	t.Helper()
	root := repoRoot(t)
	r, err := LoadEngine(root, contract)
	if err != nil {
		t.Fatalf("LoadEngine(%s): %v", contract, err)
	}
	for pc := uint64(0); pc < 4096; pc++ {
		if loc, ok := r.Resolve(pc); ok {
			if strings.Contains(loc.LineText, want) && strings.HasSuffix(loc.File, contract+".sol") {
				return true
			}
		}
	}
	return false
}

func TestResolve_obviousLie_mapsToDoubling(t *testing.T) {
	if !resolveContains(t, "LyingSwapEngineObvious", "honest * 2") {
		t.Error("expected some pc to resolve to the 'honest * 2' lie line")
	}
}

func TestResolve_subtleLie_mapsToSkippedFee(t *testing.T) {
	// The subtle engine credits `gross` instead of gross - fee.
	if !resolveContains(t, "LyingSwapEngineSubtle", "amountOut = gross") {
		t.Error("expected some pc to resolve to the 'amountOut = gross' lie line")
	}
}

func TestResolve_buggy_mapsToTruncation(t *testing.T) {
	if !resolveContains(t, "BuggySwapEngine", "netRatePerUnit") {
		t.Error("expected some pc to resolve to the truncation-bug line")
	}
}

func TestResolve_honest_mapsToFeeMath(t *testing.T) {
	if !resolveContains(t, "HonestSwapEngine", "BPS_DENOMINATOR") {
		t.Error("expected some pc to resolve to the honest fee math")
	}
}

func TestResolve_unknownPC_returnsFalse(t *testing.T) {
	root := repoRoot(t)
	r, err := LoadEngine(root, "HonestSwapEngine")
	if err != nil {
		t.Fatal(err)
	}
	if _, ok := r.Resolve(9_999_999); ok {
		t.Error("expected no resolution for an out-of-range pc")
	}
}
