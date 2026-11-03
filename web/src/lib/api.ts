import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { AppState, TelemetryRecord } from "../../../server/src/types";

export type { AppState, TelemetryRecord };

export class ApiError extends Error {
  constructor(message: string, public endpoint: string, public status: number) {
    super(message);
  }
}

type SyncListener = (nextState?: AppState) => void;
const syncListeners = new Set<SyncListener>();

function isAppState(v: unknown): v is AppState {
  return Boolean(v && typeof v === "object" && "version" in v && "tranches" in v && "holds" in v);
}

export async function api<T = AppState>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const method = init?.method ?? (init?.body === undefined ? "GET" : "POST");
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
      body: init?.body === undefined ? undefined : JSON.stringify(init.body),
    });
  } catch {
    throw new ApiError("Network error: the AccordOS server is unreachable", `${method} /api${path}`, 0);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? `Request failed (${res.status})`, data.endpoint ?? `${method} /api${path}`, res.status);
  if (method !== "GET") {
    const nextState = isAppState(data) ? data : undefined;
    for (const fn of syncListeners) fn(nextState);
  }
  return data as T;
}

export const post = <T = AppState>(path: string, body: unknown = {}) => api<T>(path, { method: "POST", body });

export interface Desk {
  state: AppState | null;
  telemetry: TelemetryRecord[];
  error: ApiError | null;
  connected: boolean;
  reload: () => void;
}

// Initial snapshot over HTTP, then live updates over server-sent events.
export function useDeskSource(): Desk {
  const [state, setState] = useState<AppState | null>(null);
  const [telemetry, setTelemetry] = useState<TelemetryRecord[]>([]);
  const [error, setError] = useState<ApiError | null>(null);
  const [connected, setConnected] = useState(false);
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    let closed = false;
    setError(null);
    Promise.all([api<AppState>("/state"), api<TelemetryRecord[]>("/telemetry")])
      .then(([s, t]) => {
        if (closed) return;
        latest.current = s.version;
        setState(s);
        setTelemetry(t);
      })
      .catch((e) => !closed && setError(e instanceof ApiError ? e : new ApiError(String(e), "GET /api/state", 0)));
    const es = new EventSource("/api/stream");
    es.onopen = () => setConnected(true);
    es.onerror = () => setConnected(false);
    es.addEventListener("state", (e) => {
      const s = JSON.parse((e as MessageEvent).data) as AppState;
      if (s.version >= latest.current || s.version <= 1) {
        latest.current = s.version;
        setState(s);
        setError(null);
      }
    });
    es.addEventListener("telemetry", (e) => {
      const t = JSON.parse((e as MessageEvent).data) as TelemetryRecord;
      setTelemetry((prev) => [t, ...prev].slice(0, 300));
    });
    const onMutate: SyncListener = (nextState) => {
      if (closed) return;
      if (nextState) {
        latest.current = nextState.version;
        setState(nextState);
        setError(null);
      } else {
        api<AppState>("/state")
          .then((s) => {
            if (!closed) {
              latest.current = s.version;
              setState(s);
            }
          })
          .catch(() => {});
      }
      api<TelemetryRecord[]>("/telemetry")
        .then((t) => !closed && setTelemetry(t))
        .catch(() => {});
    };
    syncListeners.add(onMutate);
    return () => {
      closed = true;
      syncListeners.delete(onMutate);
      es.close();
    };
  }, [nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { state, telemetry, error, connected, reload };
}

export const DeskContext = createContext<Desk | null>(null);
export function useDesk(): Desk {
  const d = useContext(DeskContext);
  if (!d) throw new Error("DeskContext missing");
  return d;
}
