# Dev ports (`config/ports.json`)

Single source of truth for **eth-l2** local services. Avoids drift between Next.js (`3000`/`3001`), generic APIs (`8000`/`8080`), and Anvil RPC ports.

| Service | Port | Notes |
|---------|------|--------|
| Frontend (Next.js) | **3001** | Not Next's default `3000` — leaves room for other apps |
| Backend (Go REST + WS) | **8080** | Override bind with `GOAPI_ADDR` or `PORT` |
| Anvil L1 | **8545** | Foundry default |
| Anvil OP L2 | **9545** | `+1000` from L1 |
| Anvil ZK L2 | **10545** | `+2000` from L1 |

## Consumers

- `app/data/ports.ts` — frontend URLs (override API with `NEXT_PUBLIC_API_URL`)
- `backend/internal/config/ports.go` — load at server start; seeds `chain.Chains`
- `Makefile` — `make dev` / `make stop` read ports via `node scripts/ports-shell-exports.mjs`
- `bin/.env.sh` — chain RPC env vars
- `foundry.toml` `[rpc_endpoints]` — keep in sync manually (same host/ports)

## Overrides

| Env var | Effect |
|---------|--------|
| `NEXT_PUBLIC_API_URL` | Browser REST base. Unset = local `ports.json`. `same-origin` / empty = Vercel rewrite proxy. Absolute URL = call that host. Ignored during local `next dev` unless `ETH_L2_ENABLE_API_PROXY=1`. |
| `NEXT_PUBLIC_WS_URL` | Browser WebSocket URL (use `wss://api-staging-eth-l2.magro.dev/stream` on Vercel). Ignored during local `next dev` unless `ETH_L2_ENABLE_API_PROXY=1`. |
| `ETH_L2_BACKEND_ORIGIN` | Server-only rewrite target on Vercel (default public tunnel hostname) |
| `ETH_L2_ENABLE_API_PROXY` | Set `1` to force Vercel-style same-origin rewrites + remote API URLs during local Next |
| `GOAPI_ADDR` | Backend listen `host:port` (prefer `127.0.0.1:8080` on the MacBook) |
| `PORT` | Backend listen `127.0.0.1:port` |
| `ETH_L2_FRONTEND_PORT` | `make frontend` / Playwright when set |

## Hosted split (Vercel UI + MacBook API)

Public API hostname only: `https://api-staging-eth-l2.magro.dev` (Cloudflare Tunnel → `http://127.0.0.1:8080`).

See [README.md](../README.md#hosted-split-vercel--macbook) and [.env.example](../.env.example). Never document LAN IPs or tunnel credentials in the repo.

When adding another project on the same machine, give it its own `config/ports.json` with a non-overlapping block (e.g. frontend `3002`, backend `8081`, Anvil `8645`…).
