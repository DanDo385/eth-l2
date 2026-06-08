# Rollup Mechanics Lab

A local lab for **L2 rollup mechanics**: Optimistic (OP) and ZK-style pipelines with L1 contracts, TradeEngine on L2, dispute games, and a Next.js frontend for visualization.

## Portfolio demo package

- Loom guide: [`DEMO_GUIDE.md`](./DEMO_GUIDE.md)
- Portfolio tag: `deep-weeds`
- Recommended video length: 150-180 seconds
- Best GIF loop: trade → wETH price path → bad batch → bisection → opcode mismatch → resolved invalid
- Thumbnail hook: `CATCH THE LYING SEQUENCER`


## Prerequisites

- **Foundry** (forge, cast, anvil): `brew install foundry` or [getfoundry.sh](https://getfoundry.sh)
- **Node.js** 18+ and **pnpm**: `npm install -g pnpm`
- **jq**: `brew install jq` (for deployment and pipeline scripts)
- **Bash**: Scripts work with system bash (macOS default is fine after recent fixes)

## Quick start

```bash
# 1. Install dependencies (Foundry + Node)
make install

# 2. Build contracts and run tests
make build
make test

# 3. Start the three local chains (L1 + OP-L2 + ZK-L2)
make start

# 4. Deploy contracts to all chains
make deploy

# 5. Run the Optimistic pipeline (trades → batches → dispute → finalize)
make op

# 6. (Optional) Run the ZK pipeline stub
make zk

# 7. Generate report and copy artifacts for the frontend
make analyze
make artifacts

# 8. Stop the chains when done
make stop
```

## Makefile targets

| Target | Description |
|--------|-------------|
| `make install` | Install Foundry (ethereum, forge-std), pnpm deps |
| `make build` | Build Solidity contracts (`forge build`) |
| `make test` | Run Forge tests (`forge test -vvv`) |
| `make start` | Start 3 Anvil chains: L1 (8545), OP-L2 (9545), ZK-L2 (10545) |
| `make stop` | Stop all Anvil processes started by `make start` |
| `make deploy` | Deploy L1 contracts + TradeEngine on both L2s; writes `out/addresses.json` |
| `make op` | Run OP pipeline: generate trades on OP-L2, post batches to L1, challenge bad batch, bisect, finalize |
| `make zk` | Run ZK pipeline (stub; writes placeholder under `out/zk/`) |
| `make analyze` | Build `out/report.json` from addresses and run artifacts |
| `make artifacts` | Copy `out/report.json` → `public/report.json` for Next.js |
| `make dev` | Start Next.js dev server (`pnpm dev`) |
| `make pipeline` | Full run: start → deploy → op → zk → analyze → artifacts → stop |
| `make tmux` | Start all 3 chains in a tmux session (optional) |
| `make clean` | Remove `out/`, `forge-out/`, `.next/`, `public/report.json` |

## Architecture

- **L1 (port 8545, chain ID 31337)**  
  - `OptimisticPortalMock`: post batches, challenge, finalize  
  - `DisputeGameMock`: bisection dispute  
  - `ZkRollupMock` + `VerifierMock`: ZK batch submission (mock)

- **OP-L2 (port 9545, chain ID 31338)**  
  - `TradeEngine`: execute trades, state root, trade hashes for batching

- **ZK-L2 (port 10545, chain ID 31339)**  
  - `TradeEngine`: same as OP-L2 (ZK pipeline uses it in stub)

Scripts in `bin/` are driven by `bin/.env.sh` (RPC URLs, chain IDs, deployer/challenger/trader keys). Outputs go to `out/`: PIDs, `addresses.json`, `env.json`, OP batches/receipts/disputes, and `report.json`.

## Running servers (multiple terminals)

You can run chains and the frontend in separate terminals:

**Terminal 1 – chains**

```bash
make start
# leave running; deploy and op in same or another terminal
make deploy
make op
# when done: make stop
```

**Terminal 2 – frontend**

```bash
make artifacts   # if you just ran pipeline
make dev         # Next.js at http://localhost:3000
```

Or use `make tmux` to get a pre-split tmux session with the three Anvil instances and a spare pane.

## Pipeline details (OP)

1. **Phase 1** – Generate deterministic trades on OP-L2 (`executeTrade`), mine blocks.
2. **Phase 2** – Every `BATCH_EVERY` blocks (default 5), build a batch (state root, trade hashes), post to L1 via `postBatch`. One batch is deliberately corrupted (bad state root).
3. **Phase 3** – Challenger calls `challengeBatch(badBatchId)`.
4. **Phase 4** – Sequencer and challenger alternate `bisect` rounds until depth is reached.
5. **Phase 5** – Challenger calls `resolve(batchId, false)` (challenger wins).
6. **Phase 6** – Time is advanced; valid batches are finalized via `finalizeBatch`.

Tunables (env): `SEED`, `BLOCKS`, `TRADES_PER_BLOCK_MIN`, `TRADES_PER_BLOCK_MAX`, `BATCH_EVERY`, `BAD_BATCH_ID`.

## Project layout

```
bin/           # start.sh, stop.sh, deploy.sh, run_op.sh, run_zk.sh, analyze.sh, .env.sh
contracts/     # L1 (portal, dispute, zk mock), L2 (TradeEngine), shared (hashing)
script/        # DeployL1.s.sol, DeployL2.s.sol
test/          # Forge tests (TradeEngine, OptimisticPortal, DisputeGame, ZkRollup)
app/           # Next.js app (layout, page; report.json consumed from public/)
out/           # PIDs, addresses.json, report.json, op/ and zk/ artifacts
public/        # report.json copied here by make artifacts
```

## License

MIT
