import portsFile from "../../config/ports.json";

/** Canonical dev ports — keep in sync via config/ports.json only. */
export const PORTS = portsFile;

/** Public Cloudflare Tunnel hostname (no LAN IPs). */
export const PUBLIC_TUNNEL_ORIGIN = "https://api-staging-eth-l2.magro.dev";

export const FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? PORTS.frontend.url;

/**
 * Local `next dev` / `make frontend` should hit Go on loopback even if
 * `vercel env pull` left same-origin / tunnel vars in `.env.local`.
 * Opt into the Vercel-style proxy with ETH_L2_ENABLE_API_PROXY=1.
 */
function useLocalBackend(): boolean {
  if (process.env.ETH_L2_ENABLE_API_PROXY === "1") return false;
  if (process.env.VERCEL === "1") return false;
  return process.env.NODE_ENV === "development";
}

/**
 * REST base for browser fetch().
 * - unset → local Go API from ports.json
 * - "" or "same-origin" → Vercel same-origin proxy (rewrites → tunnel)
 * - absolute URL → call that host directly (e.g. tunnel hostname)
 */
function resolveApiBase(): string {
  if (useLocalBackend()) return PORTS.backend.url;
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (raw === undefined) return PORTS.backend.url;
  const trimmed = raw.trim().replace(/\/$/, "");
  if (trimmed === "" || trimmed === "same-origin") return "";
  return trimmed;
}

export const API_BASE = resolveApiBase();

/** True when the UI expects a remote (tunnel / proxied) backend, not LAN localhost. */
export const IS_REMOTE_BACKEND =
  !useLocalBackend() &&
  (API_BASE === "" ||
    Boolean(process.env.NEXT_PUBLIC_WS_URL) ||
    (API_BASE.startsWith("https://") && !API_BASE.includes("127.0.0.1")));

/**
 * WebSocket URL. On Vercel, prefer NEXT_PUBLIC_WS_URL; if REST is same-origin,
 * fall back to the public tunnel (Vercel rewrites do not proxy WS upgrades).
 * Local next dev always uses the loopback Go WS.
 */
export const WS_URL = useLocalBackend()
  ? `${PORTS.backend.url.replace(/^http/, "ws")}${PORTS.backend.wsPath}`
  : (process.env.NEXT_PUBLIC_WS_URL ??
    `${(API_BASE || (IS_REMOTE_BACKEND ? PUBLIC_TUNNEL_ORIGIN : PORTS.backend.url)).replace(
      /^http/,
      "ws",
    )}${PORTS.backend.wsPath}`);

export const BACKEND_PORT = PORTS.backend.port;
export const FRONTEND_PORT = PORTS.frontend.port;

/** Absolute or same-origin health probe path. */
export function healthUrl(): string {
  return `${API_BASE}/health`;
}
