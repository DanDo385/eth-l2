#!/usr/bin/env node
/**
 * Print shell export statements from config/ports.json.
 * Usage: eval "$(node scripts/ports-shell-exports.mjs)"
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const ports = JSON.parse(readFileSync(join(root, "config/ports.json"), "utf8"));

const lines = [
  `ETH_L2_FRONTEND_PORT=${ports.frontend.port}`,
  `ETH_L2_FRONTEND_URL=${ports.frontend.url}`,
  `ETH_L2_BACKEND_PORT=${ports.backend.port}`,
  `ETH_L2_BACKEND_URL=${ports.backend.url}`,
  `ETH_L2_BACKEND_WS_URL=${ports.backend.url.replace(/^http/, "ws")}${ports.backend.wsPath}`,
  `L1_RPC=${ports.anvil.l1.rpc}`,
  `OP_L2_RPC=${ports.anvil.opL2.rpc}`,
  `ZK_L2_RPC=${ports.anvil.zkL2.rpc}`,
  `L1_CHAIN_ID=${ports.anvil.l1.chainId}`,
  `OP_L2_CHAIN_ID=${ports.anvil.opL2.chainId}`,
  `ZK_L2_CHAIN_ID=${ports.anvil.zkL2.chainId}`,
  `ETH_L2_L1_ANVIL_PORT=${ports.anvil.l1.port}`,
  `ETH_L2_OP_ANVIL_PORT=${ports.anvil.opL2.port}`,
  `ETH_L2_ZK_ANVIL_PORT=${ports.anvil.zkL2.port}`,
];

for (const line of lines) {
  process.stdout.write(`export ${line}\n`);
}
