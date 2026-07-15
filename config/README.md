# Dev ports (`config/ports.json`)

Single source of truth for **eth-l2** local services. Avoids drift between Next.js (`3000`/`3001`), generic APIs (`8000`/`8080`), and Anvil RPC ports.

| Service | Port | Notes |
|---------|------|--------|
| Frontend (Next.js) | **3001** | Not Next's default `3000` - leaves room for other apps |
| Backend (Go REST + WS) | **8080** | eth-tx-lifecycle uses **8081**; override bind with `GOAPI_ADDR` or `PORT` |
| Anvil L1 | **8545** | Foundry default |
| Anvil OP L2 | **9545** | `+1000` from L1 |
| Anvil ZK L2 | **10545** | `+2000` from L1 |

## Consumers

- `app/data/ports.ts` - frontend URLs (override API with `NEXT_PUBLIC_API_URL`)
- `backend/internal/config/ports.go` - load at server start; seeds `chain.Chains`
- `scripts/lib/ports.sh` - shell exports for staging / launchd scripts
- `Makefile` - `make dev` / `make stop` read ports via `node`
- `bin/.env.sh` - chain RPC env vars
- `foundry.toml` `[rpc_endpoints]` - keep in sync manually (same host/ports)

## Overrides

| Env var | Effect |
|---------|--------|
| `NEXT_PUBLIC_API_URL` | Browser REST base. Unset = local `ports.json`. `same-origin` / empty = Vercel rewrite proxy. Absolute URL = call that host. Ignored during local `next dev` unless `ETH_L2_ENABLE_API_PROXY=1`. |
| `NEXT_PUBLIC_WS_URL` | Browser WebSocket URL (use `wss://api-staging-eth-l2.magro.dev/stream` on Vercel). Ignored during local `next dev` unless `ETH_L2_ENABLE_API_PROXY=1`. |
| `ETH_L2_BACKEND_ORIGIN` | Server-only rewrite target on Vercel (default public tunnel hostname) |
| `ETH_L2_ENABLE_API_PROXY` | Set `1` to force Vercel-style same-origin rewrites + remote API URLs during local Next |
| `GOAPI_ADDR` | Backend listen `host:port` (prefer `127.0.0.1:8080` on staging) |
| `PORT` | Backend listen `127.0.0.1:port` |
| `ETH_L2_FRONTEND_PORT` | `make frontend` / Playwright when set |
| `ETH_L2_ALLOWED_ORIGINS` | Comma-separated CORS allowlist (staging scripts default to `staging.vercelOrigin`) |
| `ETH_L2_API_TOKEN` | Optional bearer token for POST `/api/*` + WebSocket `/stream` (see [backend/README.md](../backend/README.md)) |
| `ETH_L2_TRUST_X_FORWARDED_FOR` | Set `1` to use `X-Forwarded-For` for rate-limit client IP (trusted proxy only) |
| `ETH_L2_IDLE_STOP_SECONDS` | Seconds after last lab WebSocket disconnect before `Stop()` (default `45`; `0` disables) |

## Hosted split (Vercel UI + Ubuntu API)

| | |
|--|--|
| Public API | `https://api-staging-eth-l2.magro.dev` |
| Tunnel | `eth-l2-ubuntu` via `cloudflared-eth-l2.service` |
| Tunnel origin | `http://127.0.0.1:8080` on Ubuntu (`eth-l2.service`) |
| Vercel UI | `https://eth-l2.vercel.app` |
| Vercel env | `ETH_L2_BACKEND_ORIGIN`, `NEXT_PUBLIC_API_URL=same-origin`, `NEXT_PUBLIC_WS_URL=wss://…/stream` |
| Public auth | `ETH_L2_API_TOKEN` **unset** (browser WS cannot carry a secret safely) |

See [README.md](../README.md#hosted-split-vercel--ubuntu) and [.env.example](../.env.example). Never document LAN IPs or tunnel credentials in the repo.

## Durable backend (Ubuntu systemd)

| Unit | Role |
|------|------|
| `eth-l2.service` | Go API + Anvil session manager (`WorkingDirectory=/home/deploy/Code/eth-l2`) |
| `cloudflared-eth-l2.service` | Cloudflare Tunnel → public hostname |

Env file: `/etc/eth-l2/eth-l2.env` (loopback bind, CORS allowlist, Foundry on `PATH`, idle stop). Anvil listeners appear only after `/api/start`.

Ready probe: `curl -s http://127.0.0.1:8080/health/ready` → `READY` (on the VPS), or `curl -s https://api-staging-eth-l2.magro.dev/health/ready`.

Optional local helpers (laptop demos only): `./scripts/start-staging-backend.sh`, launchd install/uninstall.
