// Package sourcemap resolves an EVM program counter back to the Solidity source
// that produced it, by parsing a Foundry artifact's deployedBytecode.sourceMap.
// It is the pc-to-source mechanism the opcode fraud-proof view (WO-4) uses to
// show the exact line a diverging instruction came from.
package sourcemap

import (
	"encoding/hex"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// SourceLoc is a resolved source position.
type SourceLoc struct {
	File     string `json:"file"`
	Line     int    `json:"line"`     // 1-indexed
	Col      int    `json:"col"`      // 1-indexed
	Snippet  string `json:"snippet"`  // the exact source slice for the instruction
	LineText string `json:"lineText"` // the full source line, for context
}

type entry struct {
	start  int
	length int
	file   int
}

// Resolver maps program counters to source locations for one compiled contract.
type Resolver struct {
	pcToEntry map[uint64]entry
	idToPath  map[int]string
	sources   map[int][]byte
}

type artifactJSON struct {
	DeployedBytecode struct {
		Object    string `json:"object"`
		SourceMap string `json:"sourceMap"`
	} `json:"deployedBytecode"`
}

type buildInfoJSON struct {
	SourceIDToPath map[string]string `json:"source_id_to_path"`
}

// LoadEngine loads the resolver for one L2 engine contract (one contract per
// file, file name == contract name).
func LoadEngine(repoRoot, contractName string) (*Resolver, error) {
	artifactPath := filepath.Join(repoRoot, "forge-out", contractName+".sol", contractName+".json")
	relPath := filepath.Join("contracts", "l2", contractName+".sol")
	return Load(repoRoot, artifactPath, relPath)
}

// Load builds a resolver from an artifact and the source path it belongs to.
func Load(repoRoot, artifactPath, contractRelPath string) (*Resolver, error) {
	raw, err := os.ReadFile(artifactPath)
	if err != nil {
		return nil, fmt.Errorf("read artifact: %w", err)
	}
	var art artifactJSON
	if err := json.Unmarshal(raw, &art); err != nil {
		return nil, fmt.Errorf("parse artifact: %w", err)
	}

	idToPath, err := findSourceIDs(repoRoot, contractRelPath)
	if err != nil {
		return nil, err
	}

	code, err := decodeHex(art.DeployedBytecode.Object)
	if err != nil {
		return nil, fmt.Errorf("decode bytecode: %w", err)
	}

	entries := parseSourceMap(art.DeployedBytecode.SourceMap)
	pcToEntry := buildPCMap(code, entries)

	sources := make(map[int][]byte)
	for id, p := range idToPath {
		if b, err := os.ReadFile(filepath.Join(repoRoot, p)); err == nil {
			sources[id] = b
		}
	}

	return &Resolver{pcToEntry: pcToEntry, idToPath: idToPath, sources: sources}, nil
}

// Resolve returns the source location for a program counter.
func (r *Resolver) Resolve(pc uint64) (SourceLoc, bool) {
	e, ok := r.pcToEntry[pc]
	if !ok || e.start < 0 {
		return SourceLoc{}, false
	}
	src, ok := r.sources[e.file]
	if !ok {
		return SourceLoc{}, false
	}
	start := e.start
	if start > len(src) {
		return SourceLoc{}, false
	}
	end := start + e.length
	if end > len(src) {
		end = len(src)
	}
	line, col := lineCol(src, start)
	return SourceLoc{
		File:     r.idToPath[e.file],
		Line:     line,
		Col:      col,
		Snippet:  strings.TrimSpace(string(src[start:end])),
		LineText: strings.TrimSpace(lineAt(src, line)),
	}, true
}

// FindLine returns the source location of the first instruction whose source
// line (in this contract's own file) contains substr. Used to point at an
// engine's deviating statement (the `* 2`, the skipped fee, the truncation).
func (r *Resolver) FindLine(substr string) (SourceLoc, bool) {
	best := SourceLoc{}
	found := false
	for pc := uint64(0); pc < 1<<16; pc++ {
		e, ok := r.pcToEntry[pc]
		if !ok {
			continue
		}
		src, ok := r.sources[e.file]
		if !ok || e.start > len(src) {
			continue
		}
		line, _ := lineCol(src, e.start)
		text := strings.TrimSpace(lineAt(src, line))
		if strings.Contains(text, substr) {
			if !found || line < best.Line {
				loc, ok := r.Resolve(pc)
				if ok {
					best = loc
					found = true
				}
			}
		}
	}
	return best, found
}

// ── source-map parsing ───────────────────────────────────────────────────────

// parseSourceMap decodes solc's "s:l:f:j:m;..." format into one entry per
// instruction, carrying forward omitted fields.
func parseSourceMap(sm string) []entry {
	if sm == "" {
		return nil
	}
	parts := strings.Split(sm, ";")
	out := make([]entry, len(parts))
	var cur entry
	for i, p := range parts {
		fields := strings.Split(p, ":")
		cur.start = intField(fields, 0, cur.start)
		cur.length = intField(fields, 1, cur.length)
		cur.file = intField(fields, 2, cur.file)
		out[i] = cur
	}
	return out
}

func intField(fields []string, idx, prev int) int {
	if idx >= len(fields) || fields[idx] == "" {
		return prev
	}
	v, err := strconv.Atoi(fields[idx])
	if err != nil {
		return prev
	}
	return v
}

// buildPCMap walks the bytecode, assigning each instruction's source-map entry
// to its program counter and skipping PUSH immediate data.
func buildPCMap(code []byte, entries []entry) map[uint64]entry {
	m := make(map[uint64]entry)
	pc := 0
	for i := 0; pc < len(code) && i < len(entries); i++ {
		m[uint64(pc)] = entries[i]
		op := code[pc]
		size := 1
		if op >= 0x60 && op <= 0x7f { // PUSH1..PUSH32
			size += int(op-0x60) + 1
		}
		pc += size
	}
	return m
}

// ── helpers ──────────────────────────────────────────────────────────────────

func decodeHex(s string) ([]byte, error) {
	s = strings.TrimPrefix(s, "0x")
	return hex.DecodeString(s)
}

func lineCol(src []byte, offset int) (line, col int) {
	line, col = 1, 1
	for i := 0; i < offset && i < len(src); i++ {
		if src[i] == '\n' {
			line++
			col = 1
		} else {
			col++
		}
	}
	return line, col
}

func lineAt(src []byte, line int) string {
	lines := strings.Split(string(src), "\n")
	if line-1 >= 0 && line-1 < len(lines) {
		return lines[line-1]
	}
	return ""
}

// findSourceIDs locates the build-info whose source_id_to_path covers the given
// contract, and returns its fileIndex -> path map.
func findSourceIDs(repoRoot, contractRelPath string) (map[int]string, error) {
	dir := filepath.Join(repoRoot, "forge-out", "build-info")
	files, err := os.ReadDir(dir)
	if err != nil {
		return nil, fmt.Errorf("read build-info: %w", err)
	}
	for _, f := range files {
		if !strings.HasSuffix(f.Name(), ".json") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, f.Name()))
		if err != nil {
			continue
		}
		var bi buildInfoJSON
		if json.Unmarshal(raw, &bi) != nil {
			continue
		}
		covers := false
		for _, p := range bi.SourceIDToPath {
			if p == contractRelPath {
				covers = true
				break
			}
		}
		if !covers {
			continue
		}
		out := make(map[int]string, len(bi.SourceIDToPath))
		for k, v := range bi.SourceIDToPath {
			if id, err := strconv.Atoi(k); err == nil {
				out[id] = v
			}
		}
		return out, nil
	}
	return nil, fmt.Errorf("no build-info covers %s", contractRelPath)
}
