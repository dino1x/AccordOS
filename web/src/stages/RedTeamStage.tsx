import { useEffect, useRef, useState } from "react";
import type { Attack, Dispute, FirewallVerdict } from "../../../server/src/types";
import { Btn, Figure, Panel, Tag, useAction } from "../components/ui";
import { api, ApiError, post, useDesk } from "../lib/api";
import { REDTEAM_RESULT_EVENT, type RedTeamResult } from "../components/JudgeTour";
import { money } from "../lib/format";

type Verdict = FirewallVerdict & { name: string };

export function RedTeamStage() {
  const { state } = useDesk();
  const [attacks, setAttacks] = useState<Attack[] | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({});
  const [total, setTotal] = useState<number | null>(null);
  const { busy, run } = useAction();
  const counter = useRef<HTMLSpanElement>(null);

  const load = () => {
    setError(null);
    api<Attack[]>("/redteam/attacks").then(setAttacks).catch((e) => setError(e));
  };
  useEffect(load, [state?.auctions.length]);

  // Results fired by the judge tour land here too.
  useEffect(() => {
    const onResult = (e: Event) => {
      const r = (e as CustomEvent<RedTeamResult>).detail;
      setVerdicts(Object.fromEntries(r.verdicts.map((v) => [v.attackId, v])));
      setTotal(r.totalMicros);
    };
    window.addEventListener(REDTEAM_RESULT_EVENT, onResult);
    return () => window.removeEventListener(REDTEAM_RESULT_EVENT, onResult);
  }, []);

  // Count-up of total firewall time, written straight to the DOM.
  useEffect(() => {
    if (total === null || !counter.current) return;
    let raf = 0;
    const start = performance.now();
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / 600);
      if (counter.current) counter.current.textContent = `${Math.round(total * k).toLocaleString()}us`;
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [total]);

  const fire = (ids?: string[]) =>
    run(ids ? `one-${ids[0]}` : "all", () => post<{ verdicts: Verdict[]; totalMicros: number }>("/redteam/run", ids ? { ids } : {}), (r) => {
      const blocked = r.verdicts.filter((v) => v.blocked).length;
      return `${blocked} of ${r.verdicts.length} instructions blocked in ${r.totalMicros}us, 0 PayPal calls`;
    }).then((r) => {
      if (!r) return;
      setVerdicts((prev) => ({ ...prev, ...Object.fromEntries(r.verdicts.map((v) => [v.attackId, v])) }));
      if (!ids) setTotal(r.totalMicros);
    });

  const ran = Object.values(verdicts);
  const attackRuns = ran.filter((v) => v.attackId !== "control");
  const checkIds = ran[0]?.checks.map((c) => c.id) ?? [];

  return (
    <>
      <div className="stage-head">
        <div>
          <div className="eyebrow">/05 <b>proof</b> firewall + disputes</div>
          <h1>Try to steal the money. <span className="hl">Watch it fail.</span></h1>
          <p>Fire real attack payloads at the same firewall that guards every payout. Each instruction is inspected by deterministic code before any PayPal API is reachable. The clean control must pass, or the firewall is just saying no.</p>
        </div>
        <Btn kind="primary" busy={busy === "all"} disabled={!attacks} onClick={() => fire()}>
          Run all {attacks?.length ?? ""} attacks
        </Btn>
      </div>

      <div className="grid cols-12">
        <div className="span-12">
          <Panel title="Bench result" meta="Deterministic code, no model in the loop">
            <div className="figures hero">
              <Figure lg label="Blocked" value={ran.length ? `${attackRuns.filter((v) => v.blocked).length}/${attackRuns.length}` : "-"} sub="Attack instructions stopped" />
              <Figure lg label="Firewall time" value={<span ref={counter}>{total === null ? "-" : `${total}us`}</span>} sub={ran.length ? `max ${Math.max(...ran.map((v) => v.micros))}us per instruction` : "Budget: under 5ms each"} />
              <Figure lg label="PayPal calls" value={ran.length ? ran.reduce((s, v) => s + v.paypalCalls, 0) : "-"} sub="Blocked money never reaches an API" />
              <Figure lg label="Control" value={verdicts.control ? (verdicts.control.blocked ? "Blocked" : "Passed") : "-"} sub="A clean payment must pass" />
            </div>
          </Panel>
        </div>

        <div className="span-7">
          <Panel title="Attack library" meta="Payloads modelled on real payment-fraud and prompt-injection patterns" loading={!attacks && !error} error={error} onRetry={load} flush>
            {attacks?.map((a) => {
              const v = verdicts[a.id];
              return (
                <div key={a.id} className="attack">
                  <div style={{ minWidth: 0 }}>
                    <div className="row"><strong>{a.name}</strong><span className="tag neutral">{a.vector}</span></div>
                    <div className="dim" style={{ fontSize: 13, marginTop: 2 }}>{a.description}</div>
                    <div className="payload trunc" title={`${a.instruction.payeeEmail} ${a.instruction.memo}`}>
                      {money(a.instruction.amount)} {a.instruction.currency} to {a.instruction.payeeEmail}: "{a.instruction.memo.replace(/[​-‏⁠-⁤﻿]/g, "[ZW]")}"
                    </div>
                  </div>
                  <div className="verdict">
                    {v ? (
                      <>
                        <Tag state={v.blocked ? "blocked" : "captured"}>{v.blocked ? `Blocked: ${v.firstFailure}` : "Passed"}</Tag>
                        <span className="muted">{v.micros}us</span>
                      </>
                    ) : (
                      <Btn sm busy={busy === `one-${a.id}`} onClick={() => fire([a.id])}>Fire</Btn>
                    )}
                  </div>
                </div>
              );
            })}
          </Panel>
        </div>

        <div className="span-5">
          <Panel title="Check matrix" meta="Every instruction runs every check" empty={!ran.length ? { text: "Run the bench to see which check stopped each attack." } : false}>
            <div style={{ overflowX: "auto" }}>
              <table className="matrix">
                <thead>
                  <tr><th>Instruction</th>{checkIds.map((c) => <th key={c} title={c}>{c.slice(0, 4)}</th>)}</tr>
                </thead>
                <tbody>
                  {ran.map((v) => (
                    <tr key={v.attackId}>
                      <td className="trunc" style={{ maxWidth: 150 }} title={v.name}>{v.attackId}</td>
                      {v.checks.map((c) => <td key={c.id}><span className={`c ${c.pass ? "ok" : "no"}`} title={`${c.label}: ${c.detail}`} /></td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Panel>
          <div style={{ height: 16 }} />
          <DisputePanel />
        </div>
      </div>
    </>
  );
}

function DisputePanel() {
  const { state, error, reload } = useDesk();
  const { busy, run } = useAction();
  const disputes = state?.disputes ?? [];
  const canOpen = state?.holds.some((h) => h.status === "captured");
  return (
    <Panel
      title="Dispute defense"
      meta="Disputes API"
      loading={!state && !error}
      error={error}
      onRetry={reload}
      actions={<Btn sm kind="danger" busy={busy === "open"} disabled={!canOpen} onClick={() => run("open", () => post("/disputes", {}), "Dispute opened")} title={canOpen ? "Simulates CUSTOMER.DISPUTE.CREATED" : "Capture a hold first"}>Open dispute</Btn>}
      empty={state && !disputes.length ? { text: canOpen ? "No disputes. Open one to watch the defense agent build its evidence." : "Capture a hold in Stage 02 first: only captured purchases can be disputed." } : false}
    >
      <div style={{ display: "grid", gap: 12 }}>
        {disputes.map((d) => <DisputeCard key={d.id} d={d} busy={busy} run={run} />)}
      </div>
    </Panel>
  );
}

function DisputeCard({ d, busy, run }: { d: Dispute; busy: string | null; run: ReturnType<typeof useAction>["run"] }) {
  return (
    <div className="dossier">
      <div className="row between">
        <strong className="mono">{d.id}</strong>
        <Tag state={d.status === "resolved" ? "captured" : "disputed"}>{d.status.replace("_", " ")}</Tag>
      </div>
      <div className="muted" style={{ fontSize: 12, margin: "4px 0 10px" }}>{d.reason.replace(/_/g, " ").toLowerCase()}, {money(d.amount)}</div>
      {d.dossier ? (
        <>
          <p>{d.dossier.summary}</p>
          {d.dossier.evidence.map((e) => (
            <div key={e.label} className="rule" style={{ marginBottom: 4 }}>
              <span className="mark ok">EV</span>
              <span><span>{e.label}</span> <span className="mono muted" style={{ fontSize: 11 }}>{e.ref}</span><br /><span className="muted" style={{ fontSize: 11 }}>{e.detail}</span></span>
            </div>
          ))}
          <div className="muted" style={{ fontSize: 11, marginTop: 8 }}>Written by {d.dossier.source === "claude" ? "Claude" : "template"}. {d.dossier.submitNote}</div>
        </>
      ) : (
        <p className="dim">Evidence not yet assembled.</p>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        {d.status === "open" && <Btn sm kind="primary" busy={busy === `def${d.id}`} onClick={() => run(`def${d.id}`, () => post(`/disputes/${d.id}/defend`), "Evidence dossier submitted")}>Build and submit dossier</Btn>}
        {d.status === "evidence_submitted" && <Btn sm busy={busy === `res${d.id}`} onClick={() => run(`res${d.id}`, () => post(`/disputes/${d.id}/resolve`), "Dispute closed, quarantine lifted")}>Mark resolved</Btn>}
      </div>
    </div>
  );
}
