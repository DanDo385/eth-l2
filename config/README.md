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
| `NEXT_PUBLIC_API_URL` | Frontend → backend URL (tunnel / production) |
| `GOAPI_ADDR` | Backend listen `host:port` |
| `PORT` | Backend listen `:port` only |
| `ETH_L2_FRONTEND_PORT` | `make frontend` / Playwright when set |

When adding another project on the same machine, give it its own `config/ports.json` with a non-overlapping block (e.g. frontend `3002`, backend `8081`, Anvil `8645`…).
