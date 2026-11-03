import type { Task } from "../../../server/src/types";
import { lazy, Suspense } from "react";
import { Btn, ErrorBoundary, Figure, List, Panel, Skeleton, useAction } from "../components/ui";

const BryntumSchedulerView = lazy(() => import("../components/BryntumSchedulerView").then((m) => ({ default: m.BryntumSchedulerView })));
import { post, useDesk } from "../lib/api";
import { dayLabel, time } from "../lib/format";

const DAY_W = 22;
const ROW_H = 40;

export function ScheduleStage() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const tasks = state?.tasks ?? [];
  const loading = !state && !error;
  const end = tasks.length ? Math.max(...tasks.map((t) => t.start + t.duration)) : 0;
  const gates = tasks.filter((t) => t.gate);
  const closedGates = gates.filter((t) => !t.gate!.satisfied).length;
  const moved = new Set(state?.events[0]?.diff.map((d) => d.taskId) ?? []);
  const nextInvoice = state?.tranches.find((t) => t.status === "sent");

  const webhookPaid = () =>
    post("/webhooks/paypal", {
      id: `WH-SIM-${Date.now()}`,
      event_type: "INVOICING.INVOICE.PAID",
      resource: { invoice: { id: nextInvoice!.invoiceId, payments: { paid_amount: { currency_code: "USD", value: nextInvoice!.earlyPay.discountedAmount.toFixed(2) } } } },
    });

  return (
    <>
      <div className="stage-head">
        <div>
          <div className="eyebrow">/03 <b>delivery</b> webhooks + bryntum</div>
          <h1>A schedule that <span className="hl">waits on money</span></h1>
          <p>PayPal states are hard dependencies. A task cannot start until its gate clears: an invoice paid, a hold authorized, funds captured at dispatch. When a webhook or carrier event arrives, the operations agent reflows the plan.</p>
        </div>
        <div className="row">
          <Btn busy={busy === "wh"} disabled={!nextInvoice} onClick={() => run("wh", webhookPaid, "Webhook INVOICING.INVOICE.PAID processed")} title="Posts a PayPal-shaped webhook to /api/webhooks/paypal">
            Webhook: invoice paid
          </Btn>
          <Btn busy={busy === "delay"} disabled={!tasks.length} onClick={() => run("delay", () => post("/schedule/delay", { days: 3 }), "Carrier delay applied")}>
            Carrier delay +3d
          </Btn>
          <Btn kind="danger" busy={busy === "disp"} disabled={!state?.holds.some((h) => h.status === "captured")} onClick={() => run("disp", () => post("/disputes", {}), "CUSTOMER.DISPUTE.CREATED received")} title="Needs a captured hold">
            Webhook: dispute
          </Btn>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="span-12">
          <Panel
            title="Delivery Gantt"
            meta={tasks.length ? `Day 0 = ${state!.dayZero}` : undefined}
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && !tasks.length ? { text: "Plan a brief to generate the delivery schedule." } : false}
            flush
            actions={
              <div className="legend hide-sm">
                <span><i style={{ background: "var(--st-authorized-bg)", border: "1px solid var(--st-authorized)" }} />Ready</span>
                <span><i style={{ background: "var(--st-invoiced-bg)", border: "1px solid var(--st-invoiced)" }} />Critical path</span>
                <span><i style={{ border: "1px dashed var(--st-blocked)" }} />Gate closed</span>
              </div>
            }
          >
            {tasks.length > 0 && (
              <>
                <div className="figures" style={{ padding: 16, borderBottom: "1px solid var(--line)" }}>
                  <Figure label="Handover" value={`Day ${end}`} sub={dayLabel(state!.dayZero, end)} />
                  <Figure label="Gates closed" value={closedGates} sub={`of ${gates.length} payment gates, ${tasks.filter((t) => t.status === "blocked").length} tasks waiting`} />
                  <Figure label="Critical tasks" value={tasks.filter((t) => t.critical).length} sub="Zero slack" />
                  <Figure label="Reflows" value={state!.events.length} sub="Webhook and carrier events" />
                </div>
                <Gantt tasks={tasks} span={end + 4} moved={moved} dayZero={state!.dayZero} />
              </>
            )}
          </Panel>
        </div>

        <div className="span-12">
          <Panel title="Bryntum Scheduler" meta="Payment-gated crew and carrier bookings. Red bookings wait on a PayPal gate. Hover a booking for its gate." loading={loading} error={error} onRetry={reload} empty={!loading && !tasks.length ? { text: "No bookings yet." } : false} flush>
            {tasks.length > 0 && (
              <ErrorBoundary fallback={(e, retry) => <div className="error" role="alert"><p>Bryntum Scheduler could not render ({e.message}). The dependency Gantt above shows the same plan.</p><Btn onClick={retry}>Retry</Btn></div>}>
                <Suspense fallback={<div style={{ padding: 16 }}><Skeleton lines={6} /></div>}>
                  <BryntumSchedulerView tasks={tasks} dayZero={state!.dayZero} moved={moved} />
                </Suspense>
              </ErrorBoundary>
            )}
          </Panel>
        </div>

        <div className="span-12">
          <Panel title="Operations agent log" meta="Reflows caused by PayPal and carrier events" loading={loading} error={error} onRetry={reload} empty={!loading && !state?.events.length ? { text: "No events yet. Pay a tranche, approve holds or trigger a webhook to see the plan reflow." } : false}>
            <div className="events">
              <List
                items={state?.events ?? []}
                max={8}
                more="events"
                render={(e) => (
                  <div key={e.id} className="event">
                    <div className="row between">
                      <strong className="trunc">{e.label}</strong>
                      <span className="when">{time(e.ts)}</span>
                    </div>
                    <div className="dim" style={{ fontSize: 12 }}>{e.narrative}</div>
                    {e.diff.length > 0 && (
                      <div className="mono muted" style={{ fontSize: 11, marginTop: 4 }}>
                        {e.diff.map((d) => `${d.taskId} d${d.from}->d${d.to}`).join("  ")}
                      </div>
                    )}
                  </div>
                )}
              />
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function Scale({ span, dayZero }: { span: number; dayZero: string }) {
  const marks = Array.from({ length: Math.ceil(span / 7) }, (_, i) => i * 7);
  return (
    <div className="gantt-row" style={{ height: 28, borderBottom: "1px solid var(--line)" }}>
      <div className="name label" style={{ justifyContent: "center" }}>Task</div>
      <div className="gantt-scale" style={{ gridTemplateColumns: `repeat(${marks.length}, ${7 * DAY_W}px)` }}>
        {marks.map((m) => <div key={m}>d{m} {dayLabel(dayZero, m)}</div>)}
      </div>
    </div>
  );
}

function Gantt({ tasks, span, moved, dayZero }: { tasks: Task[]; span: number; moved: Set<string>; dayZero: string }) {
  const width = span * DAY_W;
  const index = Object.fromEntries(tasks.map((t, i) => [t.id, i]));
  return (
    <div className="gantt">
      <div className="gantt-inner" style={{ minWidth: 200 + width }}>
        <Scale span={span} dayZero={dayZero} />
        <svg className="deps" width={width} height={tasks.length * ROW_H} aria-hidden>
          {tasks.flatMap((t) =>
            t.deps.map((d) => {
              const from = tasks[index[d]];
              const x1 = (from.start + from.duration) * DAY_W;
              const y1 = index[d] * ROW_H + 20;
              const x2 = t.start * DAY_W;
              const y2 = index[t.id] * ROW_H + 20;
              const mid = Math.max(x1 + 6, x2 - 8);
              return <path key={`${d}-${t.id}`} d={`M${x1} ${y1} H${mid} V${y2} H${x2 - 2}`} fill="none" stroke="var(--line-strong)" strokeWidth="1" />;
            }),
          )}
        </svg>
        {tasks.map((t) => (
          <div key={t.id} className="gantt-row">
            <div className="name">
              <span className="trunc" title={t.name}>{t.name}</span>
              <span className="muted trunc" style={{ fontSize: 11 }} title={t.gate?.label}>{t.resource}{t.gate ? ` / ${t.gate.label}` : ""}</span>
            </div>
            <div className="gantt-lane">
              <div
                className={`bar ${t.status === "blocked" ? "blocked" : t.critical ? "critical" : ""} ${moved.has(t.id) ? "moved" : ""}`}
                style={{ transform: `translate3d(${t.start * DAY_W}px,0,0)`, width: Math.max(t.duration * DAY_W - 2, 18) }}
                title={`${t.name}: day ${t.start} to ${t.start + t.duration}`}
              >
                {t.duration}d
              </div>
              {t.gate && (
                <div
                  className={`gate ${t.gate.satisfied ? "ok" : ""}`}
                  style={{ transform: `translate3d(${t.start * DAY_W}px,0,0) rotate(45deg)` }}
                  title={`${t.gate.label}: ${t.gate.satisfied ? "cleared" : "waiting"}`}
                />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
