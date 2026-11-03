import { AllCommunityModule, ModuleRegistry, themeQuartz, type ColDef, type ICellRendererParams } from "ag-grid-community";
import { AgGridReact } from "ag-grid-react";
import { lazy, Suspense, useMemo, useState } from "react";
import type { AppState, LedgerRow, Widget } from "../../../server/src/types";
import { Btn, ErrorBoundary, Figure, Panel, Skeleton, Tag, useAction } from "../components/ui";

const StudioCanvas = lazy(() => import("../components/StudioCanvas").then((m) => ({ default: m.StudioCanvas })));
import { api, post, useDesk } from "../lib/api";
import { money, money0, time } from "../lib/format";

ModuleRegistry.registerModules([AllCommunityModule]);

const gridTheme = themeQuartz.withParams({
  backgroundColor: "var(--ink-1)",
  foregroundColor: "var(--text-0)",
  headerBackgroundColor: "var(--ink-2)",
  headerTextColor: "var(--text-2)",
  borderColor: "var(--line)",
  accentColor: "var(--accent)",
  oddRowBackgroundColor: "var(--ink-1)",
  rowHoverColor: "var(--ink-2)",
  selectedRowBackgroundColor: "var(--st-captured-bg)",
  fontFamily: "var(--sans)",
  headerFontFamily: "var(--mono)",
  fontSize: 13,
  headerFontSize: 11.5,
  headerFontWeight: 400,
  wrapperBorder: false,
  wrapperBorderRadius: 0,
  columnBorder: false,
  spacing: 7,
  rowHeight: 42,
  headerHeight: 40,
});

function ActionsCell(p: ICellRendererParams<LedgerRow>) {
  const { busy, run } = useAction();
  const row = p.data;
  if (!row || !row.actions.length) return null;
  const isHold = row.ref.startsWith("hold-");
  return (
    <div className="cell-actions">
      {row.actions.includes("capture") && isHold && <Btn sm busy={busy === "c"} onClick={() => run("c", () => post(`/holds/${row.ref}/capture`), "Captured")}>Capture</Btn>}
      {row.actions.includes("void") && isHold && <Btn sm kind="danger" busy={busy === "v"} onClick={() => run("v", () => post(`/holds/${row.ref}/void`), "Voided")}>Void</Btn>}
      {row.actions.includes("remind") && <Btn sm busy={busy === "r"} onClick={() => run("r", () => post(`/tranches/${row.ref}/remind`), "Reminder sent")}>Remind</Btn>}
      {row.actions.includes("dispute") && isHold && <Btn sm kind="ghost" busy={busy === "d"} onClick={() => run("d", () => post("/disputes", { holdId: row.ref }), "Dispute opened")}>Dispute</Btn>}
    </div>
  );
}

const columns: ColDef<LedgerRow>[] = [
  { field: "id", headerName: "Entry", width: 90, cellClass: "mono" },
  { field: "ts", headerName: "Time", width: 96, valueFormatter: (p) => (p.value ? time(p.value) : ""), cellClass: "mono" },
  { field: "from", headerName: "From", flex: 1, minWidth: 140, tooltipField: "from" },
  { field: "to", headerName: "To", flex: 1, minWidth: 140, tooltipField: "to" },
  { field: "amount", headerName: "Amount", width: 130, type: "rightAligned", valueFormatter: (p) => money(p.value ?? 0), cellClass: "mono" },
  { field: "state", headerName: "State", width: 120, cellRenderer: (p: ICellRendererParams<LedgerRow>) => (p.data ? <Tag state={p.data.state} /> : null), filter: true },
  { field: "api", headerName: "PayPal API", width: 190, tooltipField: "api" },
  { field: "memo", headerName: "Memo", flex: 1.6, minWidth: 220, tooltipField: "memo" },
  { headerName: "Actions", width: 190, cellRenderer: ActionsCell, sortable: false, filter: false },
];

export function LedgerStage() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const loading = !state && !error;
  const ledger = state?.ledger ?? [];
  const sum = (pred: (r: LedgerRow) => boolean) => ledger.filter(pred).reduce((s, r) => s + r.amount, 0);
  const inbound = (r: LedgerRow) => r.to === "AccordOS escrow";

  return (
    <>
      <div className="stage-head">
        <div>
          <div className="eyebrow">/04 <b>treasury</b> payouts + ag studio</div>
          <h1>Every dollar, <span className="hl">every API call</span></h1>
          <p>Every dollar from client to escrow to vendor, with the PayPal call that moved it and inline actions. Ask a finance question to spawn a live widget over the same stream.</p>
        </div>
        <Btn kind="primary" busy={busy === "pay"} disabled={!state?.holds.some((h) => h.status === "captured")} onClick={() => run("pay", () => post("/payouts"), "Payout batch sent through the firewall")}>
          Run firewall-gated payouts
        </Btn>
      </div>

      <div className="grid cols-12">
        <div className="span-12">
          <Panel title="Custody chain" meta="Client to escrow to vendor" loading={loading} error={error} onRetry={reload} empty={!loading && !ledger.length ? { text: "No money has moved yet." } : false}>
            <div className="chain">
              <div className="node">
                <div className="label">{state?.brief?.client.name ?? "Client"}</div>
                <Figure label="Invoiced or held" value={money0(sum((r) => inbound(r) && (r.state === "invoiced" || r.state === "authorized")))} sub={`${money0(sum((r) => inbound(r) && r.state === "captured"))} settled`} />
              </div>
              <div className="link" aria-hidden />
              <div className="node">
                <div className="label">AccordOS escrow</div>
                <Figure label="Balance" value={money0(sum((r) => inbound(r) && r.state === "captured") - sum((r) => r.state === "paidout"))} sub={`${money0(sum((r) => r.state === "disputed"))} disputed`} />
              </div>
              <div className="link" aria-hidden />
              <div className="node">
                <div className="label">Vendors and crew</div>
                <Figure label="Paid out" value={money0(sum((r) => r.state === "paidout"))} sub={`${ledger.filter((r) => r.state === "blocked").length} blocked attempts`} />
              </div>
            </div>
          </Panel>
        </div>

        <div className="span-12">
          <Panel title="Ledger" meta={`${ledger.length} entries`} loading={loading} error={error} onRetry={reload} empty={!loading && !ledger.length ? { text: "Ledger entries appear as tranches, holds and payouts move." } : false} flush>
            <div className="ledger-grid">
              <AgGridReact<LedgerRow> theme={gridTheme} rowData={ledger} columnDefs={columns} getRowId={(p) => p.data.id} animateRows enableCellTextSelection tooltipShowDelay={300} />
            </div>
          </Panel>
        </div>

        <div className="span-12">
          <WidgetStudio />
        </div>

        <div className="span-12">
          <Panel title="AG Studio analytics canvas" meta="Drag fields from Ledger, Tranches, Holds and Payouts to build reports. Data refreshes with every PayPal event." loading={loading} error={error} onRetry={reload} flush>
            {state && (
              <ErrorBoundary fallback={(e, retry) => <div className="error" role="alert"><p>AG Studio could not render: {e.message}</p><Btn onClick={retry}>Retry</Btn></div>}>
                <Suspense fallback={<div style={{ padding: 16 }}><Skeleton lines={6} /></div>}>
                  <StudioCanvas state={state} />
                </Suspense>
              </ErrorBoundary>
            )}
          </Panel>
        </div>
      </div>
    </>
  );
}

const SUGGESTIONS = ["Which unpaid invoices should we nudge first?", "Flag anything unusual above 1.5 sigma", "What happens to margin if costs rise 8% and the dollar drops 4%?"];

function WidgetStudio() {
  const { state } = useDesk();
  const { busy, run } = useAction();
  const [prompt, setPrompt] = useState("");
  const submit = (p: string) => run("spawn", () => post("/widgets", { prompt: p }), (s) => `Widget built: ${s.widgets[0]?.title}`).then((r) => r && setPrompt(""));
  return (
    <Panel title="Widget studio" meta={state?.aiMode === "claude" ? "Claude maps the question to a widget" : "Rules map the question to a widget"}>
      <form className="prompt-bar" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) submit(prompt.trim()); }}>
        <input type="text" value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Ask a finance question about this project" aria-label="Widget prompt" maxLength={300} />
        <Btn kind="primary" type="submit" busy={busy === "spawn"} disabled={!prompt.trim()}>Build widget</Btn>
      </form>
      <div className="chips" style={{ margin: "10px 0 16px" }}>
        {SUGGESTIONS.map((s) => <button key={s} className="chip" onClick={() => submit(s)} disabled={busy !== null}>{s}</button>)}
      </div>
      {state && state.widgets.length === 0 ? (
        <div className="empty"><p>No widgets yet. Ask a question or pick a suggestion.</p></div>
      ) : (
        <div className="widgets">{state?.widgets.map((w) => <WidgetCard key={w.id} w={w} s={state} />)}</div>
      )}
    </Panel>
  );
}

function WidgetCard({ w, s }: { w: Widget; s: AppState }) {
  const { run } = useAction();
  return (
    <Panel
      title={w.title}
      meta={<span className="trunc" title={w.prompt}>{w.source === "claude" ? "Claude" : "Rules"}</span>}
      actions={<Btn sm kind="ghost" onClick={() => run("rm", () => api(`/widgets/${w.id}`, { method: "DELETE" }))}>Remove</Btn>}
    >
      {w.kind === "anomaly" && <AnomalyRadar s={s} z={w.params.zThreshold} />}
      {w.kind === "margin" && <MarginCliff s={s} fx={w.params.fxShiftPct} cost={w.params.costShiftPct} />}
      {w.kind === "nudge" && <NudgeBoard s={s} minDays={w.params.minDaysOverdue} />}
    </Panel>
  );
}

function AnomalyRadar({ s, z }: { s: AppState; z: number }) {
  const rows = s.ledger.filter((r) => r.state !== "draft");
  const amounts = rows.map((r) => r.amount);
  const mean = amounts.reduce((a, b) => a + b, 0) / (amounts.length || 1);
  const sd = Math.sqrt(amounts.reduce((a, b) => a + (b - mean) ** 2, 0) / (amounts.length || 1)) || 1;
  const scored = rows.map((r) => ({ r, z: (r.amount - mean) / sd, flag: Math.abs((r.amount - mean) / sd) >= z || r.state === "blocked" || r.state === "disputed" }));
  const flagged = scored.filter((x) => x.flag);
  if (!rows.length) return <div className="empty"><p>No settled ledger entries to scan yet.</p></div>;
  const R = 90;
  return (
    <div className="row" style={{ alignItems: "flex-start", gap: 16 }}>
      <svg width={2 * R + 20} height={2 * R + 20} viewBox={`${-R - 10} ${-R - 10} ${2 * R + 20} ${2 * R + 20}`} role="img" aria-label={`${flagged.length} anomalies`}>
        {[1, 2, 3, 4].map((k) => <circle key={k} r={(k / 4) * R} fill="none" stroke="var(--line)" />)}
        <circle r={(Math.min(z, 4) / 4) * R} fill="none" stroke="var(--st-invoiced)" strokeDasharray="3 3" />
        {scored.map((x, i) => {
          const a = (i / scored.length) * Math.PI * 2 - Math.PI / 2;
          const rad = (Math.min(Math.abs(x.z), 4) / 4) * R;
          return <circle key={x.r.id} cx={Math.cos(a) * rad} cy={Math.sin(a) * rad} r={x.flag ? 4.5 : 3} fill={x.flag ? "var(--st-blocked)" : "var(--st-captured)"}><title>{`${x.r.memo}: ${money(x.r.amount)}, z ${x.z.toFixed(2)}`}</title></circle>;
        })}
      </svg>
      <div style={{ flex: 1, minWidth: 160 }}>
        <Figure label="Flagged" value={flagged.length} sub={`of ${rows.length} entries, threshold ${z} sigma`} />
        <div style={{ marginTop: 8 }}>
          {flagged.slice(0, 5).map((x) => (
            <div key={x.r.id} className="trunc" style={{ fontSize: 12 }} title={x.r.memo}>
              <span className="mono">{money0(x.r.amount)}</span> <span className="dim">{x.r.memo}</span>
            </div>
          ))}
          {flagged.length > 5 && <div className="muted" style={{ fontSize: 12 }}>+{flagged.length - 5} more</div>}
        </div>
      </div>
    </div>
  );
}

function MarginCliff({ s, fx: fx0, cost: cost0 }: { s: AppState; fx: number; cost: number }) {
  const [fx, setFx] = useState(fx0);
  const [cost, setCost] = useState(cost0);
  const model = useMemo(() => {
    const budget = s.brief?.budget ?? 0;
    const procurement = s.auctions.length ? s.auctions.reduce((t, a) => t + a.winningBid.total, 0) : s.allocation?.categories.find((c) => c.key === "procurement")?.chosen.cost ?? 0;
    const crew = s.allocation?.categories.find((c) => c.key === "crew")?.chosen.cost ?? 0;
    const imported = 0.6; // share of hardware priced off non-USD supply
    const margin = (c: number, f: number) => budget - procurement * (1 + c / 100) * (1 + (imported * -f) / 100) - crew * (1 + c / 100);
    let cliff: number | null = null;
    for (let c = -10; c <= 60; c += 0.5) if (margin(c, fx) <= 0) { cliff = c; break; }
    return { budget, margin, cliff };
  }, [s, fx]);
  const m = model.margin(cost, fx);
  const xs = Array.from({ length: 41 }, (_, i) => -10 + i);
  const ys = xs.map((c) => model.margin(c, fx));
  const maxY = Math.max(...ys.map(Math.abs), 1);
  const W = 300, H = 120;
  const px = (c: number) => ((c + 10) / 40) * W;
  const py = (y: number) => H / 2 - (y / maxY) * (H / 2 - 6);
  return (
    <div>
      <div className="figures">
        <Figure label="Margin" value={<span style={{ color: m < 0 ? "var(--st-blocked)" : undefined }}>{money0(m)}</span>} sub={`${((m / (model.budget || 1)) * 100).toFixed(1)}% of contract`} />
        <Figure label="Cliff" value={model.cliff === null ? "None" : `+${model.cliff}%`} sub="Cost rise that zeroes margin" />
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" aria-label="Margin against cost shift" style={{ marginTop: 8 }}>
        <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="var(--line-strong)" />
        <polyline fill="none" stroke="var(--st-authorized)" strokeWidth={2} points={xs.map((c, i) => `${px(c)},${py(ys[i])}`).join(" ")} />
        <circle cx={px(Math.max(-10, Math.min(30, cost)))} cy={py(m)} r={4} fill="var(--accent)" />
        {model.cliff !== null && model.cliff <= 30 && <line x1={px(model.cliff)} x2={px(model.cliff)} y1={0} y2={H} stroke="var(--st-blocked)" strokeDasharray="3 3" />}
      </svg>
      <label className="label">Cost shift {cost > 0 ? "+" : ""}{cost}%</label>
      <input type="range" min={-10} max={30} step={1} value={cost} onChange={(e) => setCost(Number(e.target.value))} />
      <label className="label">USD move {fx > 0 ? "+" : ""}{fx}%</label>
      <input type="range" min={-15} max={15} step={1} value={fx} onChange={(e) => setFx(Number(e.target.value))} />
    </div>
  );
}

function NudgeBoard({ s, minDays }: { s: AppState; minDays: number }) {
  const { busy, run } = useAction();
  const today = Date.now();
  const rows = s.tranches
    .filter((t) => t.status === "sent")
    .map((t) => {
      const days = Math.round((today - new Date(`${t.dueDate}T12:00:00Z`).getTime()) / 86400000);
      return { t, days, priority: t.amount * (1 + Math.max(0, days) / 30) + (t.reminders === 0 ? 1000 : 0) };
    })
    .filter((x) => x.days >= -365 && (minDays <= 0 || x.days >= minDays))
    .sort((a, b) => b.priority - a.priority);
  if (!rows.length) return <div className="empty"><p>No open invoices match. Issued, unpaid tranches appear here ranked by priority.</p></div>;
  return (
    <div>
      {rows.map((x, i) => (
        <div key={x.t.id} className="nudge-row">
          <span className="mono muted">{i + 1}</span>
          <span style={{ minWidth: 0 }}>
            <span className="trunc" style={{ display: "block" }}>{x.t.name}</span>
            <span className="muted" style={{ fontSize: 11 }}>{x.days > 0 ? `${x.days} days overdue` : `due in ${-x.days} days`}, {x.t.reminders} reminders</span>
          </span>
          <span className="mono">{money0(x.t.amount)}</span>
          <Btn sm busy={busy === x.t.id} onClick={() => run(x.t.id, () => post(`/tranches/${x.t.id}/remind`), "Reminder sent through PayPal")}>Nudge</Btn>
        </div>
      ))}
    </div>
  );
}
