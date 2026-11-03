import { useEffect, useMemo, useState } from "react";
import type { Auction, Hold } from "../../../server/src/types";
import { PayPalApprove } from "../components/PayPalApprove";
import { Btn, Figure, List, Panel, Tag, useAction } from "../components/ui";
import { post, useDesk } from "../lib/api";
import { money, money0 } from "../lib/format";

export function BakeOffStage() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const [selected, setSelected] = useState<string | null>(null);
  const auctions = state?.auctions ?? [];
  const current = auctions.find((a) => a.id === selected) ?? auctions[0];
  const loading = !state && !error;
  const totalSavings = auctions.reduce((s, a) => s + a.savings, 0);
  const pendingHolds = auctions.filter((a) => !a.holdId && a.policy.allowed).length;

  return (
    <>
      <div className="stage-head">
        <div>
          <div className="eyebrow">/02 <b>procurement</b> channel3 + orders v2</div>
          <h1>Three vendors bid. <span className="hl">PayPal holds the winner.</span></h1>
          <p>Each line item is sourced through Channel3, then three vendor agents bid against each other. The winner becomes a PayPal Orders v2 AUTHORIZE hold only if the policy vault passes it and the payer approves.</p>
        </div>
        <div className="row">
          <Btn busy={busy === "bake"} disabled={!state?.brief} onClick={() => run("bake", () => post("/bakeoff"), (s) => `${s.auctions.length} auctions settled`)}>
            Re-run bake-off
          </Btn>
          <Btn kind="primary" busy={busy === "holds"} disabled={!pendingHolds} onClick={() => run("holds", () => post("/holds/place-all"), "Holds placed, awaiting payer approval")}>
            {pendingHolds ? `Place ${pendingHolds} holds` : "All holds placed"}
          </Btn>
        </div>
      </div>

      <div className="grid cols-12">
        <div className="span-4">
          <Panel title="Line items" meta={state ? `${state.catalogMode === "channel3" ? "Channel3 live" : "Fixture catalog"}` : undefined} loading={loading} error={error} onRetry={reload} empty={!loading && !auctions.length ? { text: "No auctions yet.", action: <Btn onClick={() => run("bake", () => post("/bakeoff"))} disabled={!state?.brief}>Run bake-off</Btn> } : false}>
            <div className="figures" style={{ marginBottom: 12 }}>
              <Figure label="Negotiated savings" value={money0(totalSavings)} sub="vs best opening bids" />
            </div>
            <div className="items">
              {auctions.map((a) => (
                <button key={a.id} className="item-btn" aria-pressed={a.id === current?.id} onClick={() => setSelected(a.id)}>
                  <span className="trunc" title={a.sku.title}><strong>{a.qty} x</strong> {a.sku.title}</span>
                  <span className="mono">{money0(a.winningBid.total)}</span>
                  <span className="muted trunc" style={{ fontSize: 11 }}>{a.vendors.find((v) => v.id === a.winnerId)?.name} / {a.sku.source === "channel3" ? a.sku.merchant : "fixture"}</span>
                  <HoldTag a={a} holds={state!.holds} />
                </button>
              ))}
            </div>
          </Panel>
        </div>

        <div className="span-8">
          {current ? <Arena key={current.id} a={current} /> : <Panel title="Arena" loading={loading} error={error} onRetry={reload} empty={!loading ? { text: "Select a line item to replay its auction." } : false} />}
        </div>

        <div className="span-12">
          <HoldsPanel />
        </div>
      </div>
    </>
  );
}

// 40x40 product photo from Channel3; hidden when there is none or it fails to load.
function SkuThumb({ sku }: { sku: Auction["sku"] }) {
  const [broken, setBroken] = useState(false);
  if (!sku.imageUrl || broken) return null;
  return <img className="sku-thumb" src={sku.imageUrl} alt="" width={40} height={40} loading="lazy" referrerPolicy="no-referrer" onError={() => setBroken(true)} />;
}

function HoldTag({ a, holds }: { a: Auction; holds: Hold[] }) {
  const h = holds.find((x) => x.id === a.holdId);
  if (!a.policy.allowed) return <Tag state="blocked">Vault refused</Tag>;
  if (!h) return <Tag state="draft" />;
  if (h.status === "created") return <Tag state="invoiced">Needs approval</Tag>;
  return <Tag state={h.status === "captured" ? "captured" : h.status === "voided" ? "blocked" : "authorized"} />;
}

function Arena({ a }: { a: Auction }) {
  const { busy, run } = useAction();
  const [round, setRound] = useState(0);
  const last = a.rounds.length - 1;
  useEffect(() => {
    if (round >= last) return;
    const id = setTimeout(() => setRound((r) => r + 1), 380);
    return () => clearTimeout(id);
  }, [round, last]);

  const maxTotal = useMemo(() => Math.max(...a.rounds.flat().map((b) => b.total)), [a]);
  const bids = a.rounds[round];
  const leader = [...bids].filter((b) => !b.withdrawn).sort((x, y) => x.score - y.score)[0];
  const done = round >= last;

  return (
    <Panel
      title={
        <span className="row" style={{ flexWrap: "nowrap", minWidth: 0 }}>
          <SkuThumb sku={a.sku} />
          <span className="trunc" title={a.sku.title}>Bake-off: {a.sku.title}</span>
        </span>
      }
      meta={
        <span className="row" style={{ gap: 6 }}>
          <span>{a.qty} units, list {money(a.sku.price)}</span>
          {a.sku.url ? (
            <a href={a.sku.url} target="_blank" rel="noreferrer" title="Open the live Channel3 listing">
              {a.sku.merchant || "View listing"}
            </a>
          ) : (
            a.sku.source === "fixture" && <span className="tag neutral">Fixture</span>
          )}
        </span>
      }
      actions={
        <>
          <Btn sm kind="ghost" onClick={() => setRound(0)}>Replay</Btn>
          <Btn sm kind="ghost" onClick={() => setRound(last)}>Skip</Btn>
        </>
      }
    >
      <div className="row between" style={{ marginBottom: 12 }}>
        <span className="label">Round {round} of {last}</span>
        <div className="round-strip" style={{ width: 200 }}>
          {a.rounds.map((_, i) => <span key={i} className={i <= round ? "on" : ""} />)}
        </div>
      </div>
      <div className="lanes">
        {bids.map((b) => {
          const v = a.vendors.find((x) => x.id === b.vendorId)!;
          const isWinner = done && b.vendorId === a.winnerId;
          return (
            <div key={b.vendorId} className={`lane ${isWinner ? "winner" : ""} ${b.withdrawn ? "out" : ""}`}>
              <div style={{ minWidth: 0 }}>
                <div className="row"><strong>{v.name}</strong>{b.vendorId === leader?.vendorId && !done && <Tag state="invoiced">Leading</Tag>}{isWinner && <Tag state="captured">Winner</Tag>}</div>
                <div className="note trunc" title={v.strategy}>{v.strategy}, reliability {(v.reliability * 100).toFixed(0)}%</div>
              </div>
              <div>
                <div className="track" aria-label={`Bid total ${money(b.total)}`}>
                  <div className="fill" style={{ transform: `scaleX(${b.total / maxTotal})` }} />
                </div>
                <div className="note trunc" style={{ marginTop: 4 }} title={b.note}>{b.note}</div>
              </div>
              <div>
                <div className="bid">{money(b.total)}</div>
                <div className="note" style={{ textAlign: "right" }}>{money(b.unitPrice)}/u, {b.slaDays}d, score {b.score.toFixed(0)}</div>
              </div>
            </div>
          );
        })}
      </div>

      <hr className="rule" />
      <div className="grid cols-2">
        <div>
          <div className="row between" style={{ marginBottom: 8 }}>
            <span className="label">Policy vault</span>
            <Tag state={a.policy.allowed ? "captured" : "blocked"}>{a.policy.allowed ? "Pass" : "Refused"}</Tag>
          </div>
          <div className="rules">
            {a.policy.rules.map((r) => (
              <div key={r.id} className="rule">
                <span className={`mark ${r.pass ? "ok" : "no"}`}>{r.pass ? "OK" : "NO"}</span>
                <span><span>{r.label}</span><br /><span className="muted mono" style={{ fontSize: 11 }}>{r.detail}</span></span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <div className="figures">
            <Figure label="Award" value={money0(a.winningBid.total)} sub={`${a.winningBid.slaDays}-day delivery`} />
            <Figure label="Saved" value={money0(a.savings)} sub="vs best opening bid" />
          </div>
          <p className="dim" style={{ fontSize: 12 }}>
            {a.policy.requiresHuman ? "Above the $5,000 autonomy limit: the payer must approve the hold in PayPal." : "Inside the autonomy limit. The hold still needs payer approval in PayPal before funds are held."}
          </p>
          <Btn kind="primary" disabled={!done || !!a.holdId || !a.policy.allowed} busy={busy === "hold"} onClick={() => run("hold", () => post(`/auctions/${a.id}/hold`), "AUTHORIZE order created")}>
            {a.holdId ? "Hold placed" : "Place Orders v2 hold"}
          </Btn>
        </div>
      </div>
    </Panel>
  );
}

function HoldsPanel() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const holds = state?.holds ?? [];
  const authorized = holds.filter((h) => h.status === "authorized").length;
  const awaiting = holds.filter((h) => h.status === "created");
  const approveAll = async () => {
    for (const h of awaiting) await post(`/holds/${h.id}/authorize`);
  };
  return (
    <Panel
      title="Orders v2 holds"
      meta="Funds are authorized at award and captured only at dispatch"
      loading={!state && !error}
      error={error}
      onRetry={reload}
      empty={state && !holds.length ? { text: "No holds yet. Place holds for the winning bids above." } : false}
      actions={<>{awaiting.length > 0 && (
        <Btn
          sm
          busy={busy === "apall"}
          onClick={() => run("apall", approveAll, state?.mode === "live" ? "Approvals fast-forwarded: holds not approved in PayPal are simulated" : "All holds approved (simulated payer)")}
          title={state?.mode === "live" ? "Authorizes each hold; any hold nobody approved in the PayPal popup is simulated and labelled" : "Replay mode: simulates the payer approving every hold"}
        >
          {state?.mode === "live" ? `Fast-forward ${awaiting.length} approval${awaiting.length === 1 ? "" : "s"}` : `Approve ${awaiting.length} (simulated)`}
        </Btn>
      )}<Btn sm busy={busy === "capall"} disabled={!authorized} onClick={() => run("capall", () => post("/holds/capture-all"), "Captured at dispatch, tracking attached")}>Capture {authorized || ""} at dispatch</Btn></>}
    >
      <div style={{ display: "grid", gap: 8 }}>
        <List
          items={holds}
          max={8}
          render={(h) => {
            const auction = state!.auctions.find((x) => x.id === h.auctionId);
            return (
              <div key={h.id} className="lane" style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1fr) auto" }}>
                <div style={{ minWidth: 0 }}>
                  <div className="trunc"><strong>{auction ? `${auction.qty} x ${auction.sku.title}` : h.auctionId}</strong></div>
                  <div className="note mono trunc">order {h.orderId}{h.authorizationId ? ` / auth ${h.authorizationId}` : ""}{h.tracking ? ` / ${h.tracking.carrier} ${h.tracking.number}` : ""}</div>
                </div>
                <div className="row"><span className="mono">{money(h.amount)}</span><Tag state={h.status === "created" ? "invoiced" : h.status === "captured" ? "captured" : h.status === "voided" ? "blocked" : "authorized"}>{h.status === "created" ? "Needs approval" : undefined}</Tag>{h.fastForwarded && <span className="tag neutral" title="Live mode: no buyer approved this order in PayPal, so its authorization and capture are simulated">Fast-forwarded</span>}</div>
                <div className="row">
                  {h.status === "created" && <PayPalApprove sm label="Approve hold" orderId={h.orderId} onApproved={() => run(`a${h.id}`, () => post(`/holds/${h.id}/authorize`), "Funds held")} />}
                  {h.status === "authorized" && (
                    <>
                      <Btn sm busy={busy === `c${h.id}`} onClick={() => run(`c${h.id}`, () => post(`/holds/${h.id}/capture`), "Captured with tracking")}>Capture</Btn>
                      <Btn sm kind="danger" busy={busy === `v${h.id}`} onClick={() => run(`v${h.id}`, () => post(`/holds/${h.id}/void`), "Authorization voided")}>Void</Btn>
                    </>
                  )}
                </div>
              </div>
            );
          }}
        />
      </div>
    </Panel>
  );
}
