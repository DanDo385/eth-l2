# AGENTS.md

Canonical agent instructions for this repository.

Do not add separate root-level `.cursorrules`, `CLAUDE.md`, `GEMINI.md`, or tool-specific instruction files unless a tool absolutely requires a shim. If a shim is required, it must only point back to this file and must not contain independent rules.

## Project purpose

`eth-l2` is a rollup mechanics lab. It visualizes optimistic and ZK rollup security: L2 trades become batches, a sequencer posts a claimed state root, a challenger disputes a bad batch, **FraudProofGame** bisects Merkle-committed traces and re-executes one step on L1, and the frontend walks the proof from first principles.

Portfolio lane: `deep-weeds`.

## Demo principle

This should feel like a technical walkthrough that opens the black box.
The viewer should leave understanding how optimistic trust turns back into verification.

The emotional hook is: catch the lying sequencer.
The technical hook is: bad batch → watcher flags (off-chain) → user verifies → challenge bond → FraudProofGame → opcode/storage mismatch + source line → bond settlement.

## Agent Mode (product surface)

This repo ships **Agent Mode** for AI systems - structured, low-noise context alongside the human UI. Keep it updated in the same change as site/content updates.

| Surface | Path | Source |
|---------|------|--------|
| Human overview | `/agent/` | `app/agent/page.tsx` |
| JSON manifest | `/agent.json` | `site/agent.ts` via `app/agent.json/route.ts` |
| LLM router | `/llms.txt` | `site/agent.ts` (`getLlmsTxt`) via `app/llms.txt/route.ts` |

`getLlmsTxt()` always calls `getAgentManifest()` so the two surfaces cannot drift.

### Auto-updates from content loaders

- Demo scenarios (OP/ZK seeds, titles, captions) from `app/data/demoGallery.ts`
- Protocol constants from `app/data/protocol.ts`
- Public tunnel origin for demo health notes from `app/data/ports.ts` (`PUBLIC_TUNNEL_ORIGIN` only - never LAN)

### Hand-maintain in `site/agent.ts` / `site/constants.ts`

When these change, edit the generator (not only the UI):

1. **`navigation`** - must match real nav (Home / Optimistic / ZK / Agent Mode)
2. **`about` / `contact` / `canonicalTopics` / `PRINCIPLES`**
3. **`agentMode.preferredEntryPoints`**
4. **`SITE`** in `site/constants.ts` (name, description, public URL, owner)
5. **`app/agent/page.tsx`** copy if endpoints or principles explanation change

### Checklist after content / nav / about changes

- [ ] `/agent.json` and `/llms.txt` still look correct (`curl` locally or open in browser)
- [ ] Manifest `navigation` matches `LabFrame` + home links
- [ ] No secrets, LAN IPs, or private staging hosts in agent output
- [ ] Theme storage key in the layout boot script still matches `THEME_STORAGE_KEY` in `site/theme.ts`

Related files: `site/agent.ts`, `site/constants.ts`, `site/theme.ts`, `app/components/ThemeToggle.tsx`, `app/components/SiteChrome.tsx`, `app/agent/page.tsx`, route handlers under `app/agent.json/` and `app/llms.txt/`.

> Note: generators live under `site/` (not root `lib/`) because Foundry’s `/lib/` is gitignored and excluded from TypeScript.

## Display (light / dark)

- CSS tokens on `:root` (dark default) and `html[data-theme='light']` in `app/globals.css`
- FOUC-free boot: blocking inline script in `app/layout.tsx` (key `eth-l2-theme`)
- Toggle: `app/components/ThemeToggle.tsx` via Display control in `SiteChrome`
- No `next-themes` / ThemeProvider

## Durable staging backend (Ubuntu + tunnel)

Hosted Go + Anvil run on the Ubuntu VPS; Vercel UI talks only to the public tunnel hostname.

| Piece | Path / command |
|-------|----------------|
| Ports + staging origins | `config/ports.json` (`staging.publicApiOrigin`, `vercelOrigin`) |
| VPS units | `eth-l2.service` + `cloudflared-eth-l2.service` (`eth-l2-ubuntu` tunnel) |
| VPS env | `/etc/eth-l2/eth-l2.env` (`GOAPI_ADDR`, CORS, `PATH` with Foundry; **no** `ETH_L2_API_TOKEN` on the public demo) |
| Public API | `https://api-staging-eth-l2.magro.dev` → `127.0.0.1:8080` on Ubuntu |
| Ready probe | `GET /health/ready` → plaintext `READY` |
| Idle stop | After last lab WebSocket disconnects, wait `ETH_L2_IDLE_STOP_SECONDS` (default 45) then `Session.Stop()` |
| Local helpers (optional) | `./scripts/start-staging-backend.sh` / launchd - laptop demos only; not the hosted path |

Do not put LAN IPs or tunnel credentials in Agent Mode / docs beyond the public hostname.

## Documentation

Keep these in sync when behaviour changes:

| File | Role |
|------|------|
| [README.md](README.md) | Setup, architecture, protocol constants, tests, Vercel + Ubuntu tunnel split |
| [DEMO_GUIDE.md](DEMO_GUIDE.md) | Suggested live demo flow + macOS screen recording |
| [PLAN.md](PLAN.md) | Historical implementation plan + work-order archive |
| [docs/rollup-education-audit.md](docs/rollup-education-audit.md) | UX/education audit (findings + fix checklist) |
| [config/README.md](config/README.md) | Canonical dev ports |
| [.env.example](.env.example) | Public tunnel hostname env for Vercel (no secrets / LAN) |

## Engineering principles

- Keep the app deterministic enough for repeatable demo sessions (same seed ⇒ same behaviour). Portfolio video is captured locally with macOS Screenshot (⌘⇧5), not an external recorder.
- Prefer focused protocol mechanics over pretending this is a full production rollup.
- Make state transitions, bonds, and disputes visually inspectable.
- README and `DEMO_GUIDE.md` must match current behaviour.

## Frontend rules

- Demo-facing surfaces: `WelcomeBanner`, `BlockchainCanvas`, `OpBatchGroup`, `ZkBatchGroup`, `BlockInspector`, `OptimisticTracker`, `OpcodeRace`, `ResearchPanel` (Proof lab), `ZkInspect`, `DemoGallery`, `Scoreboard`, `EventLogPanel`, `BackendStatus`.
- Dense protocol copy belongs in `InfoTip` (hover/click expand) - keep default controls scannable.
- Fraud verdict Solidity: prefer multi-line exhibits in `engineSourceExhibits.ts` / `EngineSourceCompare` (honest vs lying engines), not a single source-map line alone.
- Keep protocol vocabulary accurate; define mechanisms when introduced (`app/data/batchEducation.ts`, `opTrackerEducation.ts`, `traceNarrative.ts`, `zkEducation.ts`).
- Overlays (opcode proof, ZK inspect) open from Proof lab, Block Inspector, or ZK batch cards - never auto-popup.
- Do not place source files under `app/lib/`; this repo's ignore rules can hide `lib/` paths. Prefer `site/` for theme/agent generators and keep runtime store code where it already lives.

## Contract / artifact rules

- Mock contracts stay mechanism-focused (`FraudProofGame`, `ZkValidityVerifier` are teaching stand-ins, not production provers).
- `broadcast/` is gitignored - deployments are reproduced at `make dev` / backend start.
- Generated artifacts should be reproducible from repo commands (`forge build`, `make build`).
- Do not commit accidental package manager lockfiles that conflict with the repo's package manager convention.

## Verification

Before reporting success after code changes:

```bash
make build
# or: npm run build && forge test && cd backend && go test ./...
```

E2E (optional): `pnpm exec playwright install chromium` then `make test-e2e`.

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes - APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->
