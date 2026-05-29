# Rollup Mechanics Lab — Makefile

REPO_ROOT := $(shell pwd)

# ── Dev ──────────────────────────────────────────────────────────────────────

# Start Go backend (manages its own anvil instances) + Next.js frontend in parallel.
dev:
	@trap 'kill 0' INT; \
	  cd backend && REPO_ROOT=$(REPO_ROOT) go run ./cmd/server & \
	  pnpm dev --port 3001 & \
	  wait

# Frontend only (useful when the backend is already running).
frontend:
	pnpm dev --port 3001

# Backend only (Go server — spins up anvil chains automatically).
backend:
	cd backend && REPO_ROOT=$(REPO_ROOT) go run ./cmd/server

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
	pnpm dlx playwright test

# ── Install ──────────────────────────────────────────────────────────────────

install:
	@command -v forge >/dev/null 2>&1 || brew install foundry
	@forge install foundry-rs/forge-std --no-git 2>/dev/null || true
	pnpm install
	pnpm dlx playwright install chromium

# ── Clean ────────────────────────────────────────────────────────────────────

clean:
	rm -rf out/ forge-out/ .next/ public/screenshots/

.PHONY: dev frontend backend build test test-contracts test-go test-e2e install clean
