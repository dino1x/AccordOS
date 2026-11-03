import { Component, createContext, useCallback, useContext, useRef, useState, type ErrorInfo, type ReactNode } from "react";
import type { MoneyState } from "../../../server/src/types";
import { ApiError } from "../lib/api";
import { STATE_LABEL } from "../lib/format";

// ---------- Toasts ----------

interface Toast {
  id: number;
  kind: "ok" | "err";
  text: string;
  retry?: () => void;
}

const ToastContext = createContext<(t: Omit<Toast, "id">) => void>(() => {});
export const useToast = () => useContext(ToastContext);

export function ToastHost({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const push = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((prev) => [...prev.slice(-2), { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), t.kind === "err" ? 7000 : 4000);
  }, []);
  return (
    <ToastContext.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.kind === "err" ? "err" : ""}`}>
            <div className="msg">{t.text}</div>
            {t.retry && (
              <button className="btn sm" onClick={() => { setToasts((p) => p.filter((x) => x.id !== t.id)); t.retry!(); }}>
                Retry
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

// Runs an API action with a busy flag, a success toast and a retryable error toast.
export function useAction() {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const run = useCallback(
    async <T,>(key: string, fn: () => Promise<T>, success?: string | ((r: T) => string)): Promise<T | undefined> => {
      setBusy(key);
      try {
        const r = await fn();
        if (success) toast({ kind: "ok", text: typeof success === "function" ? success(r) : success });
        return r;
      } catch (e) {
        const msg = e instanceof ApiError ? `${e.message} (${e.endpoint})` : String(e);
        toast({ kind: "err", text: msg, retry: () => void run(key, fn, success) });
        return undefined;
      } finally {
        setBusy(null);
      }
    },
    [toast],
  );
  return { busy, run };
}

// ---------- Primitives ----------

export function Btn(props: { onClick?: () => void; busy?: boolean; disabled?: boolean; kind?: "primary" | "danger" | "ghost"; sm?: boolean; children: ReactNode; title?: string; type?: "button" | "submit" }) {
  const cls = ["btn", props.kind ?? "", props.sm ? "sm" : ""].join(" ");
  return (
    <button type={props.type ?? "button"} className={cls} onClick={props.onClick} disabled={props.disabled || props.busy} title={props.title} aria-busy={props.busy}>
      {props.busy && <span className="spin" aria-hidden />}
      {props.children}
    </button>
  );
}

export function Tag({ state, children }: { state: MoneyState | "neutral"; children?: ReactNode }) {
  return <span className={`tag ${state}`}>{children ?? (state === "neutral" ? "" : STATE_LABEL[state])}</span>;
}

export function Figure({ label, value, sub, lg }: { label: string; value: ReactNode; sub?: ReactNode; lg?: boolean }) {
  return (
    <div className="figure">
      <div className="label">{label}</div>
      <div className={`value ${lg ? "lg" : ""}`}>{value}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

export function Skeleton({ lines = 4 }: { lines?: number }) {
  return (
    <div aria-label="Loading" role="progressbar">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="skeleton" style={{ width: `${92 - ((i * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

// Every data panel goes through this six-state contract (see DESIGN.md section 7).
export function Panel(props: {
  title: ReactNode;
  meta?: ReactNode;
  actions?: ReactNode;
  loading?: boolean;
  error?: ApiError | null;
  onRetry?: () => void;
  empty?: false | { text: string; action?: ReactNode };
  flush?: boolean;
  className?: string;
  children?: ReactNode;
}) {
  let body: ReactNode = props.children;
  if (props.loading) body = <Skeleton />;
  else if (props.error)
    body = (
      <div className="error" role="alert">
        <p>{props.error.message}</p>
        <code>{props.error.endpoint}</code>
        {props.onRetry && <Btn onClick={props.onRetry}>Retry</Btn>}
      </div>
    );
  else if (props.empty)
    body = (
      <div className="empty">
        <p>{props.empty.text}</p>
        {props.empty.action}
      </div>
    );
  return (
    <section className={`panel ${props.className ?? ""}`}>
      <header className="panel-head">
        <div className="row" style={{ minWidth: 0 }}>
          <h2>{props.title}</h2>
          {props.meta && <span className="meta">{props.meta}</span>}
        </div>
        {props.actions && <div className="row">{props.actions}</div>}
      </header>
      <div className={`panel-body ${props.flush && !props.loading && !props.error && !props.empty ? "flush" : ""}`}>{body}</div>
    </section>
  );
}

export function List<T>({ items, max, render, more }: { items: T[]; max: number; render: (t: T, i: number) => ReactNode; more?: string }) {
  const [open, setOpen] = useState(false);
  const shown = open ? items : items.slice(0, max);
  return (
    <>
      {shown.map(render)}
      {items.length > max && (
        <button className="btn ghost sm" onClick={() => setOpen((o) => !o)}>
          {open ? "Show fewer" : `+${items.length - max} more${more ? ` ${more}` : ""}`}
        </button>
      )}
    </>
  );
}

// Keeps a heavy third-party view from taking the stage down with it.
export class ErrorBoundary extends Component<{ fallback: (error: Error, retry: () => void) => ReactNode; children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("View failed, showing fallback:", error.message, info.componentStack?.split("\n")[1]?.trim());
  }
  render() {
    return this.state.error ? this.props.fallback(this.state.error, () => this.setState({ error: null })) : this.props.children;
  }
}
