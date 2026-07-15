# eth-l2 backend

Go API that drives the rollup lab: Anvil L1/OP/ZK, seeded sequencers, fraud-proof
challenge flow, REST control plane, and WebSocket event stream.

Default listen address: `127.0.0.1:8080` (see `config/ports.json`).

## Environment variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `GOAPI_ADDR` | from `ports.json` | Full bind address (`host:port`) |
| `PORT` | - | Bind `127.0.0.1:<PORT>` when `GOAPI_ADDR` unset |
| `ETH_L2_ALLOWED_ORIGINS` | unset (permissive `*`) | Comma-separated CORS allowlist. When set, GET `/api/*` requires an allowlisted `Origin` or no `Origin` (server-to-server). Never restores `*` once configured. |
| `ETH_L2_API_TOKEN` | unset | Bearer token for mutations + `/stream`. Unset = local-dev mode (auth disabled; startup warns). |
| `ETH_L2_TRUST_X_FORWARDED_FOR` | unset | Set `1`/`true` to take client IP from `X-Forwarded-For` for rate limiting. Otherwise `RemoteAddr` only. |
| `ETH_L2_RATE_LIMIT_READ` | `60` | Per-IP requests/minute for read paths (health + GET `/api/*`) |
| `ETH_L2_RATE_LIMIT_MUTATION` | `10` | Per-IP requests/minute for POST `/api/*` and `/stream` |
| `ETH_L2_IDLE_STOP_SECONDS` | `45` | Idle stop after last WebSocket disconnect (`0` disables) |

Inject `ETH_L2_API_TOKEN` through a secret manager or host environment.
**Do not commit the token to Git, and do not embed it in frontend JavaScript.**

## Authenticated mutations

When `ETH_L2_API_TOKEN` is set, these require `Authorization: Bearer <token>`:

`POST /api/start|pause|resume|stop|reseed|verify|challenge`

Health probes stay public: `GET /health`, `/health/live`, `/health/ready`.

```bash
export ETH_L2_API_TOKEN='…'   # from secret manager

curl -sS -X POST http://127.0.0.1:8080/api/pause \
  -H "Authorization: Bearer ${ETH_L2_API_TOKEN}"
```

## WebSocket authentication

Browsers cannot set `Authorization` on `WebSocket`. Pass the token as a
**subprotocol** (never as a query parameter - query strings hit access logs):

```js
// token from secret manager / server injection - not from committed JS
const ws = new WebSocket(WS_URL, [`eth-l2.bearer.${token}`]);
```

Non-browser clients may use either the subprotocol or:

```text
Authorization: Bearer <token>
```

Missing or invalid credentials → HTTP `401` before the upgrade.

## Rate limits

Exceeded quotas return HTTP `429` with a `Retry-After` header. Inactive per-IP
entries expire so the limiter does not grow without bound.
