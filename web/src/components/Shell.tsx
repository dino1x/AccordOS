import { useEffect, useRef, useState } from "react";
import type { AppState, MoneyState } from "../../../server/src/types";
import { post, useDesk } from "../lib/api";
import { time } from "../lib/format";
import { OPEN_DRAWER_EVENT, useTour } from "./JudgeTour";
import { useAction } from "./ui";

export const STAGES = [
  { id: "tranche", num: "01", name: "Tranche", sub: "Invoicing v2, QR, JS SDK v6" },
  { id: "bakeoff", num: "02", name: "Bake-Off", sub: "Channel3, Orders v2 holds" },
  { id: "schedule", num: "03", name: "Schedule", sub: "Payment-gated Gantt" },
  { id: "ledger", num: "04", name: "Ledger", sub: "AG Grid chain of custody" },
  { id: "redteam", num: "05", name: "Red-Team", sub: "Firewall, disputes" },
] as const;
export type StageId = (typeof STAGES)[number]["id"];

const COLOR: Record<MoneyState, string> = {
  draft: "var(--st-draft)",
  invoiced: "var(--st-invoiced)",
  authorized: "var(--st-authorized)",
  captured: "var(--st-captured)",
  paidout: "var(--st-paidout)",
  blocked: "var(--st-blocked)",
  disputed: "var(--st-disputed)",
};

function stageState(s: AppState | null, id: StageId): MoneyState | null {
  if (!s) return null;
  switch (id) {
    case "tranche":
      return s.tranches.some((t) => t.status === "paid") ? "captured" : s.tranches.some((t) => t.status === "sent") ? "invoiced" : s.tranches.length ? "draft" : null;
    case "bakeoff":
      return s.holds.some((h) => h.status === "captured") ? "captured" : s.holds.some((h) => h.status === "authorized") ? "authorized" : s.auctions.length ? "draft" : null;
    case "schedule":
      return s.tasks.some((t) => t.status === "blocked") ? "invoiced" : s.tasks.length ? "captured" : null;
    case "ledger":
      return s.payouts.length ? "paidout" : s.ledger.length ? "captured" : null;
    case "redteam":
      return s.disputes.some((d) => d.status !== "resolved") ? "disputed" : s.ledger.some((l) => l.state === "blocked") ? "blocked" : null;
  }
}

function Clock() {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    let raf = 0;
    let last = "";
    const tick = () => {
      const now = new Date().toISOString().slice(11, 19) + " UTC";
      if (now !== last && ref.current) ref.current.textContent = last = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return <span className="clock hide-sm" ref={ref} aria-label="Current time" />;
}

// Tavily-style announcement bar, carrying the live system state instead of marketing.
export function StatusStrip() {
  const { state, connected } = useDesk();
  return (
    <div className="strip" role="status">
      <div className="wrap">
        {state ? (
          <>
            <span className="sig on" title={state.mode === "live" ? "Calls go to api-m.sandbox.paypal.com" : "No PayPal keys configured: deterministic sandbox replay"}>
              <span className="dot" />
              {state.mode === "live" ? "Live on PayPal Sandbox" : "Replay mode: simulated PayPal Sandbox"}
            </span>
            <span className="sep hide-sm" />
            <span className="sig hide-sm" title="Brief parsing, widget intent, dispute narrative and AG Studio assistant">{state.aiMode === "claude" ? "Claude reasoning" : "Deterministic rules"}</span>
            <span className="sep hide-sm" />
            <span className="sig hide-sm" title="Product search source">{state.catalogMode === "channel3" ? "Channel3 live catalog" : "Fixture catalog"}</span>
          </>
        ) : (
          <span className="sig">Connecting to the desk</span>
        )}
        <span className="spacer" />
        <span className={`sig ${connected ? "on" : "off"}`} title="Server-sent event stream">
          <span className="dot" />
          {connected ? "Streaming" : "Offline"}
        </span>
        <Clock />
      </div>
    </div>
  );
}

function useTheme(): [string, () => void] {
  const [theme, setTheme] = useState(() => document.documentElement.dataset.theme ?? "light");
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    if (next === "dark") document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem("accordos.theme", next);
    } catch {
      // storage unavailable: theme lasts for this visit
    }
    setTheme(next);
  };
  return [theme, toggle];
}

export function Wordmark() {
  return (
    <a className="wordmark" href="#tranche" aria-label="AccordOS home">
      <svg width="30" height="30" viewBox="0 0 32 32" aria-hidden>
        <rect width="32" height="32" rx="8" fill="var(--text-0)" />
        <path d="M9 22 L16 9 L23 22" stroke="var(--ink-0)" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <path d="M11.5 18 H20.5" stroke="var(--accent-soft)" strokeWidth="2.6" strokeLinecap="round" />
      </svg>
      <span>
        accordos
        <small>on PayPal</small>
      </span>
    </a>
  );
}

export function Header() {
  const { state } = useDesk();
  const { busy, run } = useAction();
  const tour = useTour();
  const [theme, toggleTheme] = useTheme();
  return (
    <header className="header">
      <div className="wrap">
        <Wordmark />
        <div className="project" title={state?.brief?.title}>
          <b>{state?.brief?.client.name ?? "No project loaded"}</b>
          <span>{state?.brief?.title ?? "Plan a brief to begin"}</span>
        </div>
        <span className="spacer" />
        <div className="actions">
          <button className="icon-btn" onClick={toggleTheme} aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"} title={theme === "dark" ? "Light theme" : "Dark theme"}>
            {theme === "dark" ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.3 5.3l1.6 1.6M17.1 17.1l1.6 1.6M5.3 18.7l1.6-1.6M17.1 6.9l1.6-1.6" /></svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>
            )}
          </button>
          <button className="btn sm hide-sm" disabled={busy !== null} onClick={() => run("reset", () => post("/reset"), "Demo scenario re-seeded")}>
            {busy ? "Resetting" : "Reset demo"}
          </button>
          {tour && (
            <button className={`btn ${tour.running ? "" : "primary"}`} disabled={!state?.ready && !tour.running} onClick={tour.running ? tour.stop : tour.start} title="A 30-second guided walkthrough of all five stages">
              {tour.running ? "Stop tour" : <>Judge tour <span className="arrow" aria-hidden>&rarr;</span></>}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

export function StageNav({ current, onSelect }: { current: StageId; onSelect: (s: StageId) => void }) {
  const { state } = useDesk();
  const active = STAGES.find((s) => s.id === current);
  return (
    <div className="stagenav">
      <nav className="segs" aria-label="Stages">
        {STAGES.map((s) => {
          const st = stageState(state, s.id);
          return (
            <button key={s.id} className="seg" aria-current={current === s.id ? "page" : undefined} onClick={() => onSelect(s.id)} title={s.sub}>
              <span className="num">{s.num}</span>
              {s.name}
              <span className="state-dot" style={st ? { background: COLOR[st] } : undefined} aria-hidden />
            </button>
          );
        })}
      </nav>
      {active && <span className="hint">{active.sub}</span>}
    </div>
  );
}

export function TelemetryDrawer() {
  const { telemetry } = useDesk();
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  useEffect(() => {
    const show = () => setOpen(true);
    window.addEventListener(OPEN_DRAWER_EVENT, show);
    return () => window.removeEventListener(OPEN_DRAWER_EVENT, show);
  }, []);
  const last = telemetry[0];
  const sdk = telemetry.filter((t) => t.origin === "apimatic-sdk").length;
  return (
    <section className="drawer" aria-label="API telemetry">
      <button className="drawer-bar" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className="live-dot" aria-hidden />
        <span className="label">Telemetry</span>
        <span className="last trunc mono muted">
          {last ? `${time(last.ts)}  ${last.method} ${last.path}  ${last.status || "ERR"}  ${last.ms}ms${last.mcpTool ? `  tool:${last.mcpTool}` : ""}` : "No API calls yet"}
        </span>
        <span className="mono muted hide-sm">{telemetry.length} calls / {sdk} via APIMatic SDK</span>
        <span className="toggle">{open ? "Hide" : "Inspect"} <span aria-hidden>{open ? "\u2193" : "\u2191"}</span></span>
      </button>
      {open && (
        <div className="drawer-body">
          {telemetry.length === 0 ? (
            <div className="empty"><p>API calls appear here as soon as any stage moves money.</p></div>
          ) : (
            <table className="tele">
              <thead>
                <tr><th>Time</th><th>Origin</th><th>MCP tool</th><th>Call</th><th>Status</th><th>Latency</th></tr>
              </thead>
              <tbody>
                {telemetry.slice(0, 150).map((t) => (
                  <FragmentRow key={t.id} t={t} open={expanded === t.id} onToggle={() => setExpanded(expanded === t.id ? null : t.id)} />
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}

const ORIGIN_LABEL: Record<string, string> = { mcp: "MCP", "apimatic-sdk": "APIMATIC SDK", rest: "REST", replay: "REPLAY", claude: "CLAUDE", channel3: "CHANNEL3" };

function FragmentRow({ t, open, onToggle }: { t: ReturnType<typeof useDesk>["telemetry"][number]; open: boolean; onToggle: () => void }) {
  const ok = t.status >= 200 && t.status < 300 && !t.error;
  return (
    <>
      <tr className="clickable" onClick={onToggle}>
        <td>{time(t.ts)}</td>
        <td><span className={`origin ${t.origin}`}>{ORIGIN_LABEL[t.origin]}</span></td>
        <td className="dim">{t.mcpTool ?? "-"}</td>
        <td className="trunc" style={{ maxWidth: 420 }} title={t.path}>{t.method} {t.path}</td>
        <td className={ok ? "status-ok" : "status-bad"}>{t.status || "ERR"}</td>
        <td>{t.ms}ms</td>
      </tr>
      {open && (
        <tr>
          <td colSpan={6} style={{ padding: 0 }}>
            <pre>{JSON.stringify({ error: t.error, request: t.request, response: t.response }, null, 2)}</pre>
          </td>
        </tr>
      )}
    </>
  );
}
