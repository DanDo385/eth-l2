import type { WsEvent } from "../types";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export const WS_URL = API_BASE.replace(/^http/, "ws") + "/stream";
export const REST_BASE = API_BASE;

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiPost(path: string, body?: unknown) {
  const res = await fetch(`${REST_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    let message = res.statusText;
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(message, res.status);
  }
  return res;
}

export function apiGet(path: string) {
  return fetch(`${REST_BASE}${path}`);
}

// openWs returns a cleanup function. onMessage is called with typed events.
export function openWs(
  onMessage: (ev: WsEvent) => void,
  onStatus: (connected: boolean) => void,
): () => void {
  let ws: WebSocket | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let closed = false;

  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => onStatus(true);

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data as string);
        // Backend sends { type, payload } where payload is a JSON string or object
        if (msg.type && msg.payload !== undefined) {
          const payload =
            typeof msg.payload === "string"
              ? JSON.parse(msg.payload)
              : msg.payload;
          onMessage({ type: msg.type, payload } as WsEvent);
        }
      } catch {
        // ignore malformed frames
      }
    };

    ws.onclose = () => {
      onStatus(false);
      if (!closed) {
        timer = setTimeout(connect, 2000);
      }
    };

    ws.onerror = () => {
      ws?.close();
    };
  }

  connect();

  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    ws?.close();
  };
}
