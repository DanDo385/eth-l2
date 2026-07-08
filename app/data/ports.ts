import portsFile from "../../config/ports.json";

/** Canonical dev ports — keep in sync via config/ports.json only. */
export const PORTS = portsFile;

export const FRONTEND_URL =
  process.env.NEXT_PUBLIC_FRONTEND_URL ?? PORTS.frontend.url;

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? PORTS.backend.url;

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ??
  `${PORTS.backend.url.replace(/^http/, "ws")}${PORTS.backend.wsPath}`;

export const BACKEND_PORT = PORTS.backend.port;
export const FRONTEND_PORT = PORTS.frontend.port;
