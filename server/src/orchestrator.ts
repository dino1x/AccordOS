// Every operator action is one function here. Each one changes PayPal state
// (live or replayed), then the ledger, then the schedule, then commits.
import * as pp from "./paypal/client.js";
import { paypalMode } from "./config.js";
import { allocate, categoryBudget } from "./engine/allocator.js";
import { runAuction, TARGET_SLA, VENDORS } from "./engine/auction.js";
import { parseBrief, SAMPLE_BRIEF } from "./engine/brief.js";
import { pickSku, searchSkus } from "./engine/channel3.js";
import { buildDossier } from "./engine/disputes.js";
import { attackLibrary, inspect, type FirewallContext } from "./engine/firewall.js";
import { evaluateHold, HUMAN_APPROVAL_OVER } from "./engine/policy.js";
import { computeSchedule, diffSchedules, type ScheduleFacts } from "./engine/schedule.js";
import { spawnWidget } from "./engine/widgets.js";
import { addLedger, commit, resetState, state, updateLedger } from "./state.js";
import type { Attack, FirewallVerdict, Hold, PaymentInstruction, ScheduleEvent, Tranche } from "./types.js";

export class ActionError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const round2 = (n: number) => Math.round(n * 100) / 100;
const CLIENT = () => state.brief?.client.name ?? "Client";
const DESK = "AccordOS escrow";

let freightDelay = 0;
let eventSeq = 0;
const settledRefs = new Set<string>(["SETTLED-REF-0001"]);
const recentPayouts: FirewallContext["recentToPayee"] = [];

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function facts(): ScheduleFacts {
  const brief = state.brief!;
  const crew = state.allocation?.categories.find((c) => c.key === "crew")?.chosen.label ?? "3 installers x 8 days";
  const crewDays = Number(crew.match(/x (\d+) days/)?.[1] ?? 8);
  const live = state.holds.filter((h) => h.status !== "voided");
  return {
    tranchePaid: Object.fromEntries(state.tranches.map((t) => [t.milestoneId, t.status === "paid"])),
    trancheDueDay: Object.fromEntries(brief.milestones.map((m) => [m.id, m.dueDay])),
    holdsAuthorized: live.length > 0 && live.every((h) => h.status === "authorized" || h.status === "captured"),
    holdsCaptured: live.length > 0 && live.every((h) => h.status === "captured"),
    freightDays: Math.max(TARGET_SLA, ...state.auctions.map((a) => a.winningBid.slaDays)),
    freightDelay,
    disputeOpen: state.disputes.some((d) => d.status !== "resolved"),
    crewDays,
  };
}

function reschedule(kind: ScheduleEvent["kind"] | null, label: string, narrative: (diff: ScheduleEvent["diff"]) => string): void {
  if (!state.brief) return;
  const before = state.tasks;
  state.tasks = computeSchedule(state.brief, facts());
  if (!kind) return;
  const diff = diffSchedules(before, state.tasks);
  state.events.unshift({ id: `e${++eventSeq}`, ts: new Date().toISOString(), kind, label, diff, narrative: narrative(diff) });
}

function describeShift(diff: ScheduleEvent["diff"]): string {
  if (!diff.length) return "No task dates moved.";
  const net = diff.reduce((s, d) => s + (d.to - d.from), 0);
  const names = diff.map((d) => state.tasks.find((t) => t.id === d.taskId)?.name ?? d.taskId);
  const end = Math.max(...state.tasks.map((t) => t.start + t.duration));
  return `${diff.length} task${diff.length > 1 ? "s" : ""} ${net < 0 ? "pulled forward" : "pushed out"} (${names.slice(0, 3).join(", ")}${names.length > 3 ? ", ..." : ""}). Project now closes on day ${end}.`;
}

// ---------- Stage 1: brief, allocation and tranches ----------

export async function ingestBrief(text: string, opts?: { fastBoot?: boolean }) {
  const brief = await parseBrief(text, opts);
  const allocation = allocate(brief);
  resetState();
  freightDelay = 0;
  state.brief = brief;
  state.allocation = allocation;
  const procurement = categoryBudget(allocation, "procurement");
  const servicesBase = brief.budget - procurement;
  state.tranches = brief.milestones.map<Tranche>((m) => {
    const amount = round2((servicesBase * m.pct) / 100);
    return {
      id: `tr-${m.id}`,
      milestoneId: m.id,
      name: m.name,
      amount,
      dueDate: addDays(brief.startDate, m.dueDay + brief.terms.netDays),
      status: "draft",
      earlyPay: { discountPct: brief.terms.earlyPayDiscountPct, withinDays: brief.terms.earlyPayDays, discountedAmount: round2(amount * (1 - brief.terms.earlyPayDiscountPct / 100)) },
      reminders: 0,
    };
  });
  for (const t of state.tranches) addLedger({ from: CLIENT(), to: DESK, amount: t.amount, state: "draft", ref: t.id, api: "proposal", memo: `${t.name} tranche proposed`, actions: [] });
  reschedule(null, "", () => "");
  if (!opts?.fastBoot) state.ready = true;
  return commit();
}

function tranche(id: string): Tranche {
  const t = state.tranches.find((x) => x.id === id);
  if (!t) throw new ActionError(404, `Tranche ${id} not found`);
  return t;
}

export async function issueTranche(id: string) {
  const t = tranche(id);
  if (t.status !== "draft") throw new ActionError(409, `${t.name} is already ${t.status}`);
  const res = await pp.issueInvoice(state.brief!, t);
  Object.assign(t, { invoiceId: res.invoiceId, invoiceNumber: res.invoiceNumber, payerViewUrl: res.payerViewUrl, qr: res.qr, status: "sent" });
  updateLedger(t.id, { state: "invoiced", api: "Invoicing v2", memo: `Invoice ${res.invoiceId} sent with QR`, actions: ["remind"] });
  return commit();
}

export async function remindTranche(id: string) {
  const t = tranche(id);
  if (t.status !== "sent" || !t.invoiceId) throw new ActionError(409, `${t.name} has no open invoice to remind`);
  await pp.remindInvoice(t.invoiceId, `Reminder: ${t.name} for ${state.brief!.title}. Pay within ${t.earlyPay.withinDays} days to settle ${money(t.earlyPay.discountedAmount)}.`);
  t.reminders += 1;
  return commit();
}

function markTranchePaid(t: Tranche, amount: number, via: string) {
  t.status = "paid";
  updateLedger(t.id, { state: "captured", api: via, memo: `${t.name} paid ${money(amount)}${amount < t.amount ? ` (early-pay rule, ${t.earlyPay.discountPct}% off)` : ""}`, actions: [], amount });
  reschedule("invoice.paid", `${t.name} invoice paid`, (diff) => `Gate "${t.name} invoice paid" cleared. ${describeShift(diff)}`);
}

export async function payTranche(id: string) {
  const t = tranche(id);
  if (t.status !== "sent" || !t.invoiceId) throw new ActionError(409, `${t.name} must be invoiced before it can be paid`);
  const amount = t.earlyPay.discountedAmount;
  await pp.recordInvoicePayment(t.invoiceId, amount);
  markTranchePaid(t, amount, "Invoicing v2 payment");
  return commit();
}

// JS SDK v6 checkout for a tranche: create a CAPTURE order, the client approves
// in the PayPal popup, then we capture and record it against the invoice.
export async function trancheCheckoutOrder(id: string) {
  const t = tranche(id);
  if (t.status !== "sent") throw new ActionError(409, `${t.name} is not awaiting payment`);
  return pp.createCheckoutOrder(t.earlyPay.discountedAmount, `${t.name} tranche`, `${t.id} ${state.brief!.title}`);
}

export async function trancheCheckoutCapture(id: string, orderId: string) {
  const t = tranche(id);
  const cap = await pp.payOrder(orderId);
  if (t.invoiceId) await pp.recordInvoicePayment(t.invoiceId, t.earlyPay.discountedAmount);
  markTranchePaid(t, t.earlyPay.discountedAmount, `Orders v2 capture ${cap.captureId}`);
  return commit();
}

// ---------- Stage 2: sourcing, bake-off, holds ----------

export async function runBakeOff() {
  if (!state.brief) throw new ActionError(409, "Load a brief first");
  const procurementBudget = categoryBudget(state.allocation, "procurement");
  state.auctions = [];
  state.holds = state.holds.filter((h) => h.status === "captured");
  const sourced = await Promise.all(state.brief.lineItems.map(async (li) => ({ li, ...(await searchSkus(li)) })));
  for (const { li, skus } of sourced) {
    const sku = pickSku(skus, li.maxUnit);
    const base = runAuction(`auc-${li.id}`, li, sku);
    const policy = evaluateHold(base, li, procurementBudget, state.holds, state.auctions);
    state.auctions.push({ ...base, policy });
    addLedger({ from: DESK, to: VENDORS.find((v) => v.id === base.winnerId)!.name, amount: base.winningBid.total, state: "draft", ref: base.id, api: "proposal", memo: `Award proposed: ${li.qty} x ${sku.title}`, actions: [] });
  }
  reschedule(null, "", () => "");
  return commit();
}

function hold(id: string): Hold {
  const h = state.holds.find((x) => x.id === id);
  if (!h) throw new ActionError(404, `Hold ${id} not found`);
  return h;
}

export async function placeHold(auctionId: string) {
  const a = state.auctions.find((x) => x.id === auctionId);
  if (!a) throw new ActionError(404, `Auction ${auctionId} not found`);
  if (a.holdId) throw new ActionError(409, "A hold already exists for this award");
  if (!a.policy.allowed) throw new ActionError(422, `Policy vault refused: ${a.policy.rules.filter((r) => !r.pass).map((r) => r.label).join(", ")}`);
  const order = await pp.createHoldOrder(a.winningBid.total, a.id, `${a.qty} x ${a.sku.title}`);
  const h: Hold = { id: `hold-${a.lineItemId}`, orderId: order.orderId, auctionId: a.id, vendorId: a.winnerId, amount: a.winningBid.total, status: "created", approveUrl: order.approveUrl };
  state.holds.push(h);
  a.holdId = h.id;
  updateLedger(a.id, { from: CLIENT(), to: DESK, api: "Orders v2", memo: `Hold order ${order.orderId} awaiting approval${a.policy.requiresHuman ? " (over $" + HUMAN_APPROVAL_OVER + ")" : ""}`, ref: h.id });
  return commit();
}

export async function placeAllHolds() {
  for (const a of state.auctions) if (!a.holdId && a.policy.allowed) await placeHold(a.id);
  return commit();
}

// Called after the payer approves the order (JS SDK v6 onApprove in live mode,
// the simulated approval button in replay mode).
export async function authorizeHold(id: string) {
  const h = hold(id);
  if (h.status !== "created" && h.status !== "approved") throw new ActionError(409, `Hold is ${h.status}`);
  const auth = await pp.authorizeOrder(h.orderId);
  h.status = "authorized";
  h.authorizationId = auth.authorizationId;
  h.fastForwarded = !!auth.fastForwarded;
  updateLedger(h.id, {
    state: "authorized",
    api: h.fastForwarded ? "Orders v2 authorize (fast-forwarded, simulated)" : "Orders v2 authorize",
    memo: h.fastForwarded ? `No buyer approval in PayPal; authorization ${auth.authorizationId} is simulated` : `Funds held, authorization ${auth.authorizationId}`,
    actions: ["capture", "void"],
  });
  const allAuthorized = facts().holdsAuthorized;
  reschedule("hold.authorized", `Hold ${h.orderId} authorized`, (diff) => (allAuthorized ? `All supplier holds authorized. ${describeShift(diff)}` : `Waiting on ${state.holds.filter((x) => x.status === "created").length} more hold approvals.`));
  return commit();
}

const CARRIERS = ["UPS", "FEDEX", "DHL"];

export async function captureHold(id: string) {
  const h = hold(id);
  if (h.status !== "authorized" || !h.authorizationId) throw new ActionError(409, `Hold must be authorized before capture (is ${h.status})`);
  const cap = await pp.captureAuthorization(h.authorizationId, h.amount);
  h.status = "captured";
  h.captureId = cap.captureId;
  const carrier = CARRIERS[state.holds.indexOf(h) % CARRIERS.length];
  const number = `1Z${h.orderId.slice(0, 6)}${String(state.holds.indexOf(h) + 1).padStart(8, "0")}`;
  try {
    await pp.addTracking(h.orderId, cap.captureId, carrier, number);
    h.tracking = { carrier, number, status: "IN_TRANSIT" };
  } catch {
    h.tracking = { carrier, number, status: "TRACKING_REJECTED" };
  }
  updateLedger(h.id, {
    state: "captured",
    api: h.fastForwarded ? "Payments v2 capture (fast-forwarded, simulated)" : "Payments v2 capture",
    memo: `Captured ${cap.captureId}, ${carrier} ${number}${h.fastForwarded ? " (simulated capture)" : ""}`,
    actions: ["dispute"],
  });
  const allCaptured = facts().holdsCaptured;
  reschedule("hold.captured", `Hold ${h.orderId} captured at dispatch`, (diff) => (allCaptured ? `All goods dispatched with tracking. ${describeShift(diff)}` : "Partial dispatch; freight gate stays closed until every hold is captured."));
  return commit();
}

export async function captureAllHolds() {
  for (const h of state.holds) if (h.status === "authorized") await captureHold(h.id);
  return commit();
}

export async function voidHold(id: string) {
  const h = hold(id);
  if (h.status !== "authorized" || !h.authorizationId) throw new ActionError(409, `Only authorized holds can be voided (is ${h.status})`);
  await pp.voidAuthorization(h.authorizationId);
  h.status = "voided";
  const a = state.auctions.find((x) => x.id === h.auctionId);
  if (a) a.holdId = undefined;
  updateLedger(h.id, { state: "blocked", api: "Payments v2 void", memo: "Authorization voided, funds released to client", actions: [] });
  reschedule("hold.authorized", `Hold ${h.orderId} voided`, (diff) => `Award released. ${describeShift(diff)}`);
  return commit();
}

// ---------- Stage 3: schedule events ----------

export function delayShipment(days: number) {
  freightDelay += days;
  reschedule("shipment.delayed", `Carrier reports ${days}-day delay`, (diff) => `Freight extended by ${days} days. ${describeShift(diff)}`);
  return commit();
}

// ---------- Disputes ----------

export async function openDispute(holdId?: string) {
  const h = holdId ? hold(holdId) : state.holds.find((x) => x.status === "captured");
  if (!h || h.status !== "captured") throw new ActionError(409, "A captured hold is needed before a dispute can be opened");
  const real = paypalMode === "live" ? await pp.listOpenDisputes().catch(() => []) : [];
  const id = real[0]?.id ?? `PP-D-SIM-${String(state.disputes.length + 1).padStart(4, "0")}`;
  state.disputes.unshift({ id, holdId: h.id, reason: real[0]?.reason ?? "MERCHANDISE_OR_SERVICE_NOT_AS_DESCRIBED", amount: real[0]?.amount ?? h.amount, status: "open", createdAt: new Date().toISOString() });
  updateLedger(h.id, { state: "disputed", memo: `Dispute ${id} opened`, actions: [] });
  reschedule("dispute.created", `CUSTOMER.DISPUTE.CREATED ${id}`, (diff) => `Disputed goods quarantined, install crews re-planned. ${describeShift(diff)}`);
  return commit();
}

export async function defendDispute(id: string) {
  const d = state.disputes.find((x) => x.id === id);
  if (!d) throw new ActionError(404, `Dispute ${id} not found`);
  const dossier = await buildDossier(state, d);
  const h = hold(d.holdId);
  const res = await pp.provideDisputeEvidence(d.id, h.tracking?.carrier ?? "OTHER", h.tracking?.number ?? "", dossier.summary);
  d.dossier = { ...dossier, submitted: res.submitted, submitNote: res.note };
  d.status = "evidence_submitted";
  return commit();
}

export function resolveDispute(id: string) {
  const d = state.disputes.find((x) => x.id === id);
  if (!d) throw new ActionError(404, `Dispute ${id} not found`);
  d.status = "resolved";
  updateLedger(d.holdId, { state: "captured", memo: `Dispute ${d.id} resolved in seller's favour`, actions: [] });
  reschedule("dispute.resolved", `Dispute ${d.id} resolved`, (diff) => `Quarantine lifted. ${describeShift(diff)}`);
  return commit();
}

// ---------- Payouts (firewall-gated) ----------

function firewallContext(): FirewallContext {
  const remaining = (key: "procurement" | "crew" | "contingency") =>
    categoryBudget(state.allocation, key) -
    state.payouts.flatMap((p) => p.items).filter((i) => i.note.startsWith(`[${key}]`)).reduce((s, i) => s + i.amount, 0);
  return {
    categoryRemaining: { procurement: remaining("procurement"), crew: remaining("crew"), contingency: remaining("contingency") },
    awardedTotals: awards().totals,
    seenReferences: settledRefs,
    recentToPayee: recentPayouts,
    approvalThreshold: HUMAN_APPROVAL_OVER,
  };
}

// Award totals per vendor. Vendors without a live award get a fixed nominal
// award so every attack in the bench is evaluated against a real ceiling.
function awards() {
  const nominal: Record<string, number> = { atlas: 9800, meridian: 11200, kestrel: 6400 };
  const totals: Record<string, number> = {};
  const refs: Record<string, { amount: number; reference: string }> = {};
  for (const v of VENDORS) {
    const won = state.auctions.filter((a) => a.winnerId === v.id);
    const amount = won.length ? round2(won.reduce((s, a) => s + a.winningBid.total, 0)) : nominal[v.id];
    totals[v.id] = amount;
    refs[v.id] = { amount, reference: won.length ? `AUC-${v.id.toUpperCase()}-${won.length}` : `NOMINAL-${v.id.toUpperCase()}` };
  }
  return { totals, refs };
}

export async function runPayouts() {
  const t3 = state.tranches[state.tranches.length - 1];
  const pending: PaymentInstruction[] = [];
  for (const h of state.holds.filter((x) => x.status === "captured")) {
    const ref = `PAYOUT-${h.id}`;
    if (settledRefs.has(ref) || state.disputes.some((d) => d.holdId === h.id && d.status !== "resolved")) continue;
    const v = VENDORS.find((x) => x.id === h.vendorId)!;
    pending.push({ payeeEmail: v.payeeEmail, amount: h.amount, currency: "USD", reference: ref, memo: `Settlement for ${h.orderId}`, vendorId: v.id, category: "procurement" });
  }
  if (t3?.status === "paid" && !settledRefs.has("PAYOUT-CREW")) {
    const crew = categoryBudget(state.allocation, "crew");
    // Crew payee is registered as the Meridian install subcontract for the demo roster.
    pending.push({ payeeEmail: VENDORS[1].payeeEmail, amount: round2(crew), currency: "USD", reference: "PAYOUT-CREW", memo: "Crew milestone completion", vendorId: VENDORS[1].id, category: "crew" });
  }
  if (!pending.length) throw new ActionError(409, "Nothing to disburse: capture holds or get the handover tranche paid first");

  const ctx = firewallContext();
  ctx.awardedTotals = { ...ctx.awardedTotals, meridian: ctx.awardedTotals.meridian + categoryBudget(state.allocation, "crew") };
  const cleared = pending.filter((ins) => {
    const verdict = inspect(ins, ctx);
    if (verdict.blocked) addLedger({ from: DESK, to: ins.payeeEmail, amount: ins.amount, state: "blocked", ref: ins.reference, api: "Firewall (0 PayPal calls)", memo: `Blocked by ${verdict.firstFailure}`, actions: [] });
    return !verdict.blocked;
  });
  if (!cleared.length) return commit();
  const items = cleared.map((ins) => ({ receiver: ins.payeeEmail, amount: ins.amount, note: `[${ins.category}] ${ins.memo}` }));
  const res = await pp.createPayouts(items);
  state.payouts.unshift({ batchId: res.batchId, status: res.status, items });
  for (const ins of cleared) {
    settledRefs.add(ins.reference);
    recentPayouts.push({ payeeEmail: ins.payeeEmail, amount: ins.amount, at: Date.now() });
    addLedger({ from: DESK, to: VENDORS.find((v) => v.id === ins.vendorId)?.name ?? ins.payeeEmail, amount: ins.amount, state: "paidout", ref: ins.reference, api: `Payouts v1 ${res.batchId}`, memo: ins.memo, actions: [] });
  }
  if (cleared.some((c) => c.reference === "PAYOUT-CREW")) reschedule("payouts.sent", `Payout batch ${res.batchId}`, () => `${cleared.length} disbursements sent. Project closed.`);
  return commit();
}

// ---------- Stage 5: red-team bench ----------

export function attacks(): Attack[] {
  return attackLibrary(awards().refs);
}

export function redTeam(ids?: string[]): { verdicts: (FirewallVerdict & { name: string })[]; totalMicros: number } {
  // The bench runs the production firewall against an isolated context: full
  // category budgets, one settled reference and one recent sub-threshold payout,
  // so results do not depend on how far the live project has progressed.
  const ctx: FirewallContext = {
    categoryRemaining: {
      procurement: categoryBudget(state.allocation, "procurement"),
      crew: categoryBudget(state.allocation, "crew"),
      contingency: categoryBudget(state.allocation, "contingency"),
    },
    awardedTotals: awards().totals,
    seenReferences: new Set(["SETTLED-REF-0001"]),
    recentToPayee: [{ payeeEmail: VENDORS[2].payeeEmail, amount: 4900, at: Date.now() - 3600_000 }],
    approvalThreshold: HUMAN_APPROVAL_OVER,
  };
  const list = attacks().filter((a) => !ids || ids.includes(a.id));
  const verdicts = list.map((a) => ({ ...inspect(a.instruction, ctx), attackId: a.id, name: a.name }));
  for (const v of verdicts) {
    if (!v.blocked) continue;
    const a = list.find((x) => x.id === v.attackId)!;
    addLedger({ from: DESK, to: a.instruction.payeeEmail, amount: a.instruction.amount, state: "blocked", ref: `RT-${a.id}-${state.version}`, api: "Firewall (0 PayPal calls)", memo: `Red-team: ${a.name}, stopped by ${v.firstFailure}`, actions: [] });
  }
  commit();
  return { verdicts, totalMicros: verdicts.reduce((s, v) => s + v.micros, 0) };
}

// ---------- Widgets ----------

export async function addWidget(prompt: string, opts?: { fastBoot?: boolean }) {
  const w = await spawnWidget(prompt, opts);
  state.widgets.unshift(w);
  if (state.widgets.length > 6) state.widgets.length = 6;
  return commit();
}

export function removeWidget(id: string) {
  state.widgets = state.widgets.filter((w) => w.id !== id);
  return commit();
}

// ---------- Webhooks ----------

export async function handleWebhook(event: any) {
  const type: string = event?.event_type ?? "";
  const resource = event?.resource ?? {};
  if (type === "INVOICING.INVOICE.PAID") {
    const id = resource.invoice?.id ?? resource.id;
    const t = state.tranches.find((x) => x.invoiceId === id);
    if (t && t.status !== "paid") markTranchePaid(t, Number(resource.invoice?.payments?.paid_amount?.value ?? t.amount), "Webhook INVOICING.INVOICE.PAID");
  } else if (type === "CHECKOUT.ORDER.APPROVED") {
    const h = state.holds.find((x) => x.orderId === resource.id);
    if (h && h.status === "created") return authorizeHold(h.id);
  } else if (type === "CUSTOMER.DISPUTE.CREATED") {
    const captured = state.holds.find((x) => x.status === "captured");
    if (captured) return openDispute(captured.id);
  }
  return commit();
}

// ---------- Seed ----------

let inFlightSeed: Promise< ReturnType<typeof commit> > | null = null;

export async function seed() {
  const run = async () => {
    await ingestBrief(SAMPLE_BRIEF, { fastBoot: true });
    try {
      if (paypalMode === "replay") {
        await issueTranche(state.tranches[0].id);
        await payTranche(state.tranches[0].id);
        await issueTranche(state.tranches[1].id);
        await runBakeOff();
        await placeAllHolds();
        for (const h of state.holds.slice(0, 3)) await authorizeHold(h.id);
        await captureHold(state.holds[0].id);
      } else {
        await Promise.all([
          (async () => {
            await issueTranche(state.tranches[0].id);
            await payTranche(state.tranches[0].id);
          })(),
          issueTranche(state.tranches[1].id),
          runBakeOff(),
        ]);
        const eligible = state.auctions.filter((x) => x.policy.allowed).slice(0, 2);
        await Promise.all(eligible.map((a) => placeHold(a.id)));
        if (state.holds[0]) {
          await authorizeHold(state.holds[0].id);
          await captureHold(state.holds[0].id);
        }
      }
      await addWidget("Which unpaid invoices should we nudge first?", { fastBoot: true });
    } catch (err) {
      console.error("Seed stopped early:", err instanceof Error ? err.message : err);
    }
    state.ready = true;
    return commit();
  };
  inFlightSeed = run().finally(() => {
    inFlightSeed = null;
  });
  return inFlightSeed;
}

export async function ensureSeeded() {
  if (state.ready) return state;
  if (inFlightSeed) return inFlightSeed;
  return seed();
}
