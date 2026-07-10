# Rollup Mechanics Lab — Makefile

REPO_ROOT := $(shell pwd)
FRONTEND_PORT := $(shell node -p "require('./config/ports.json').frontend.port")
BACKEND_PORT := $(shell node -p "require('./config/ports.json').backend.port")
L1_ANVIL_PORT := $(shell node -p "require('./config/ports.json').anvil.l1.port")
OP_ANVIL_PORT := $(shell node -p "require('./config/ports.json').anvil.opL2.port")
ZK_ANVIL_PORT := $(shell node -p "require('./config/ports.json').anvil.zkL2.port")
DEV_PORTS := $(FRONTEND_PORT) $(BACKEND_PORT) $(L1_ANVIL_PORT) $(OP_ANVIL_PORT) $(ZK_ANVIL_PORT)

# ── Dev ──────────────────────────────────────────────────────────────────────

# Start Go backend (manages its own anvil instances) + Next.js frontend in parallel.
dev: stop
	@trap 'kill 0' INT; \
	  cd backend && REPO_ROOT=$(REPO_ROOT) go run ./cmd/server & \
	  pnpm dev --port $(FRONTEND_PORT) & \
	  wait

# Stop stale dev servers on canonical ports from config/ports.json (macOS-safe).
stop:
	@for p in $(DEV_PORTS); do \
	  pid=$$(lsof -nP -tiTCP:$$p -sTCP:LISTEN 2>/dev/null); \
	  if [ -n "$$pid" ]; then echo "Stopping port $$p (pid $$pid)"; kill $$pid; fi; \
	done

# Frontend only (useful when the backend is already running).
frontend:
	pnpm dev --port $(FRONTEND_PORT)

# Backend only (Go server — spins up anvil chains automatically).
backend:
	cd backend && REPO_ROOT=$(REPO_ROOT) go run ./cmd/server

# MacBook staging: bind loopback only (for Cloudflare Tunnel → api-staging-eth-l2.magro.dev).
backend-mbp:
	@chmod +x scripts/start-staging-backend.sh scripts/start-mbp-backend.sh
	./scripts/start-staging-backend.sh

# Durable staging backend via launchd (KeepAlive + RunAtLoad).
install-launch-agent:
	@chmod +x scripts/install-backend-launch-agent.sh
	./scripts/install-backend-launch-agent.sh

uninstall-launch-agent:
	@chmod +x scripts/uninstall-backend-launch-agent.sh
	./scripts/uninstall-backend-launch-agent.sh

# ── Build & Test ─────────────────────────────────────────────────────────────

build:
	forge build
	cd backend && go build ./...
	pnpm build

test:
	forge test
	cd backend && go test ./...

test-contracts:
	forge test -vvv

test-go:
	cd backend && go test ./... -v


test-e2e:
	pnpm exec playwright test

# ── Install ──────────────────────────────────────────────────────────────────

install:
	@command -v forge >/dev/null 2>&1 || brew install foundry
	@forge install foundry-rs/forge-std --no-git 2>/dev/null || true
	pnpm install
	pnpm exec playwright install chromium

# ── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf out/ forge-out/ .next/ public/screenshots/

.PHONY: dev stop frontend backend backend-mbp install-launch-agent uninstall-launch-agent build test test-contracts test-go test-e2e install clean
