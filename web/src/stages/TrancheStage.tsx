import { useEffect, useState } from "react";
import type { Tranche } from "../../../server/src/types";
import { PayPalApprove } from "../components/PayPalApprove";
import { Btn, Figure, Panel, Tag, useAction } from "../components/ui";
import { post, useDesk } from "../lib/api";
import { money, money0 } from "../lib/format";

const CAT_COLOR: Record<string, string> = { procurement: "var(--cat-1)", crew: "var(--cat-2)", contingency: "var(--cat-3)" };

export function TrancheStage() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const [text, setText] = useState("");
  useEffect(() => {
    if (state?.brief && !text) setText(state.brief.rawText);
  }, [state?.brief?.id]);

  const brief = state?.brief;
  const alloc = state?.allocation;
  const loading = !state && !error;

  return (
    <>
      <div className="stage-head">
        <div>
          <div className="eyebrow">/01 <b>sell side</b> invoicing v2 + JS SDK v6</div>
          <h1>From client brief <span className="hl">to paid tranches</span></h1>
          <p>Claude reads the client brief, a dynamic-programming allocator splits the budget, and each milestone becomes a PayPal Sandbox invoice with an early-payment rule and a scannable QR.</p>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="span-5">
          <Panel
            title="Client brief"
            meta={brief ? <span className="tag neutral">Parsed by {brief.source === "claude" ? "Claude" : "rules"}</span> : undefined}
            loading={loading}
            error={error}
            onRetry={reload}
            actions={
              <Btn kind="primary" busy={busy === "brief"} disabled={text.trim().length < 40} onClick={() => run("brief", () => post("/brief", { text }), (s) => `Planned ${s.brief?.milestones.length} tranches and ${s.brief?.lineItems.length} line items`)}>
                Plan from brief
              </Btn>
            }
          >
            <label className="label" htmlFor="brief">Contract or project brief</label>
            <textarea id="brief" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} placeholder="Paste a client brief with a budget, scope and payment schedule." />
            <div className="muted" style={{ marginTop: 6, fontSize: 12 }}>{text.length.toLocaleString()} characters. Replanning resets downstream stages.</div>
          </Panel>
        </div>

        <div className="span-7">
          <Panel
            title="Budget allocation"
            meta={alloc ? `DP over ${alloc.statesExplored.toLocaleString()} states in ${alloc.micros}us, $${alloc.unit} resolution` : undefined}
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && !alloc ? { text: "Plan a brief to allocate its budget." } : false}
          >
            {alloc && brief && (
              <>
                <div className="figures" style={{ marginBottom: 16 }}>
                  <Figure label="Client budget" value={money0(alloc.budget)} />
                  <Figure label="Allocated" value={money0(alloc.total)} sub={`${((alloc.total / alloc.budget) * 100).toFixed(1)}% of budget`} />
                  <Figure label="Unallocated" value={money0(alloc.budget - alloc.total)} sub={alloc.feasible ? "Kept as desk margin" : "Infeasible at minimum options"} />
                  <Figure label="Utility score" value={alloc.utility} sub="Max over all option mixes" />
                </div>
                <div className="alloc-bar" role="img" aria-label="Budget split">
                  {alloc.categories.map((c) => (
                    <div key={c.key} style={{ flexGrow: c.chosen.cost, background: CAT_COLOR[c.key] }} title={`${c.label}: ${money(c.chosen.cost)}`}>
                      {c.label}
                    </div>
                  ))}
                  <div style={{ flexGrow: Math.max(0, alloc.budget - alloc.total), background: "transparent", color: "var(--text-2)" }}>margin</div>
                </div>
                <div className="grid cols-3" style={{ marginTop: 16 }}>
                  {alloc.categories.map((c) => (
                    <div key={c.key} className="alloc-cat">
                      <div className="label" style={{ color: CAT_COLOR[c.key] }}>{c.label}</div>
                      {c.options.map((o) => (
                        <div key={o.label} className={`opt ${o.label === c.chosen.label ? "chosen" : ""}`} title={o.detail}>
                          <span className="trunc">{o.label}</span>
                          <span className="mono">{money0(o.cost)}</span>
                          <span className="u">u{o.utility}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </Panel>
        </div>

        <div className="span-12">
          <Panel
            title="Milestone tranches"
            meta={brief ? `Services portion ${money(brief.budget - (alloc?.categories.find((c) => c.key === "procurement")?.chosen.cost ?? 0))}. Procurement is funded per award through Orders v2 holds.` : undefined}
            loading={loading}
            error={error}
            onRetry={reload}
            empty={!loading && !state?.tranches.length ? { text: "No tranches yet. Plan a brief to generate them." } : false}
          >
            <div className="tranches">
              {state?.tranches.map((t) => <TrancheCard key={t.id} t={t} />)}
            </div>
          </Panel>
        </div>
      </div>
    </>
  );
}

function TrancheCard({ t }: { t: Tranche }) {
  const { busy, run } = useAction();
  const state = t.status === "paid" ? "captured" : t.status === "sent" ? "invoiced" : "draft";
  return (
    <article className={`tranche ${t.status === "draft" ? "proposal" : "committed"}`}>
      <div className="row between">
        <strong className="trunc" title={t.name}>{t.name}</strong>
        <Tag state={state} />
      </div>
      <Figure label="Amount" value={money(t.amount)} sub={`Due ${t.dueDate}`} />
      <dl className="kv">
        <dt>Early-pay rule</dt>
        <dd>{t.earlyPay.discountPct}% off within {t.earlyPay.withinDays}d</dd>
        <dt>Settles at</dt>
        <dd>{money(t.earlyPay.discountedAmount)}</dd>
        <dt>Invoice</dt>
        <dd title={t.invoiceId}>{t.invoiceId ?? "Not issued"}</dd>
        <dt>Reminders</dt>
        <dd>{t.reminders}</dd>
      </dl>
      {t.qr && (
        <div className="qr">
          <img src={t.qr} alt={`PayPal invoice QR code for ${t.name}`} width={112} height={112} />
          <div style={{ minWidth: 0 }}>
            <div className="label">Scan to pay</div>
            <a className="trunc" style={{ display: "block", fontSize: 12 }} href={t.payerViewUrl} target="_blank" rel="noreferrer">{t.payerViewUrl}</a>
          </div>
        </div>
      )}
      <div className="row">
        {t.status === "draft" && (
          <Btn kind="primary" sm busy={busy === "issue"} onClick={() => run("issue", () => post(`/tranches/${t.id}/issue`), `Invoice sent for ${t.name}`)}>
            Issue invoice
          </Btn>
        )}
        {t.status === "sent" && (
          <>
            <PayPalApprove
              sm
              label="Pay with PayPal"
              createOrder={() => post<{ orderId: string }>(`/tranches/${t.id}/checkout`)}
              onApproved={(orderId) => run("pay", () => post(`/tranches/${t.id}/checkout/${orderId}/capture`), `${t.name} captured and recorded`)}
            />
            <Btn sm busy={busy === "record"} onClick={() => run("record", () => post(`/tranches/${t.id}/pay`), `${t.name} marked paid`)} title="Records an external payment against the invoice">
              Record payment
            </Btn>
            <Btn sm kind="ghost" busy={busy === "remind"} onClick={() => run("remind", () => post(`/tranches/${t.id}/remind`), "Reminder sent")}>
              Remind
            </Btn>
          </>
        )}
        {t.status === "paid" && <span className="muted" style={{ fontSize: 12 }}>Settled. Downstream gates updated.</span>}
      </div>
    </article>
  );
}
