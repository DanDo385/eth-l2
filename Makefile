# Rollup Mechanics Lab — Makefile
SEED       ?= 42
L1_RPC     := http://127.0.0.1:8545
OP_L2_RPC  := http://127.0.0.1:9545
ZK_L2_RPC  := http://127.0.0.1:10545

# === tmux session ===
tmux:
	@tmux new-session -d -s rollup -n chains \
	  "anvil --port 8545 --chain-id 31337 --block-time 1; read" \; \
	  split-window -h \
	  "anvil --port 9545 --chain-id 31338 --block-time 1; read" \; \
	  split-window -v \
	  "anvil --port 10545 --chain-id 31339 --block-time 1; read" \; \
	  select-pane -t 0 \; split-window -v "zsh" \; \
	  select-layout tiled \; \
	  attach

# === Chain lifecycle ===
start:
	@bash bin/start.sh

stop:
	@bash bin/stop.sh

# === Build & Test ===
build:
	forge build

test:
	forge test -vvv

# === Deploy ===
deploy:
	@bash bin/deploy.sh

# === Pipelines ===
op:
	@SEED=$(SEED) bash bin/run_op.sh

zk:
	@SEED=$(SEED) bash bin/run_zk.sh

# === Analysis ===
analyze:
	@bash bin/analyze.sh

# === Artifacts for Next.js ===
artifacts:
	@mkdir -p public public/op/batches public/op/disputes public/op/receipts public/zk/batches public/zk/receipts
	@cp out/report.json public/report.json 2>/dev/null || echo "No report.json yet — run 'make analyze' first"
	@cp out/op/batches/*.json public/op/batches/ 2>/dev/null || true
	@cp out/op/disputes/*.json public/op/disputes/ 2>/dev/null || true
	@cp out/op/receipts/*.json public/op/receipts/ 2>/dev/null || true
	@cp out/zk/batches/*.json public/zk/batches/ 2>/dev/null || true
	@cp out/zk/receipts/*.json public/zk/receipts/ 2>/dev/null || true
	@echo "Artifacts copied to public/"

# === Full pipeline (non-tmux) ===
pipeline: start deploy op zk analyze artifacts
	@bash bin/stop.sh
	@echo "=== Pipeline complete ==="

# === Next.js ===
dev:
	pnpm dev

# === Install all deps ===
install:
	brew install ethereum || true
	forge install foundry-rs/forge-std || true
	pnpm install

# === Clean ===
clean:
	rm -rf out/ forge-out/ .next/ public/report.json

.PHONY: tmux start stop build test deploy op zk analyze artifacts pipeline dev install clean
