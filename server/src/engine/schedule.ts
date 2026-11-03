// Payment-dependent schedule. PayPal states are hard task gates: a task cannot
// start until its gate (invoice paid, hold authorized or captured) is met. The
// planner does a forward pass for earliest starts and a backward pass for
// slack, so a payment or carrier event visibly reflows everything downstream.
import type { Brief, GateKind, Task } from "../types.js";

export interface ScheduleFacts {
  tranchePaid: Record<string, boolean>;
  trancheDueDay: Record<string, number>;
  holdsAuthorized: boolean;
  holdsCaptured: boolean;
  freightDays: number;
  freightDelay: number;
  disputeOpen: boolean;
  crewDays: number;
}

interface Template {
  id: string;
  name: string;
  resource: string;
  duration: (f: ScheduleFacts) => number;
  deps: string[];
  gate?: { kind: GateKind; ref: string; label: string };
}

function templates(brief: Brief): Template[] {
  const [t1, t2, t3] = brief.milestones.map((m) => m.id);
  return [
    { id: "survey", name: "Site survey and kickoff", resource: "Crew A", duration: () => 2, deps: [], gate: { kind: "invoice", ref: t1, label: "Deposit invoice paid" } },
    { id: "holds", name: "Place supplier holds", resource: "Procurement desk", duration: () => 1, deps: ["survey"], gate: { kind: "hold", ref: "authorized", label: "Orders v2 holds authorized" } },
    { id: "freight", name: "Freight in transit", resource: "Carrier", duration: (f) => f.freightDays + f.freightDelay, deps: ["holds"], gate: { kind: "shipment", ref: "captured", label: "Funds captured at dispatch, tracking attached" } },
    { id: "furniture", name: "Install furniture", resource: "Crew A", duration: (f) => Math.max(2, Math.ceil(f.crewDays * 0.45)), deps: ["freight"] },
    { id: "network", name: "Network and AV install", resource: "Crew B", duration: (f) => Math.max(2, Math.ceil(f.crewDays * 0.55)), deps: ["freight"] },
    { id: "acceptance", name: "Milestone acceptance walk", resource: "Client", duration: () => 1, deps: ["furniture", "network"] },
    { id: "commission", name: "Commission and test", resource: "Crew B", duration: () => 2, deps: ["acceptance"], gate: t2 ? { kind: "invoice", ref: t2, label: "Milestone 2 invoice paid" } : undefined },
    { id: "handover", name: "Handover and snag close", resource: "Crew A", duration: () => 2, deps: ["commission"] },
    { id: "payouts", name: "Vendor and crew payouts", resource: "Treasury", duration: () => 1, deps: ["handover"], gate: t3 ? { kind: "invoice", ref: t3, label: "Handover invoice paid" } : undefined },
  ];
}

function gateMet(g: NonNullable<Template["gate"]>, f: ScheduleFacts): boolean {
  if (g.kind === "invoice") return !!f.tranchePaid[g.ref];
  if (g.kind === "hold") return f.holdsAuthorized;
  return f.holdsCaptured && !f.disputeOpen;
}

// Day the gate is expected to clear if it has not cleared yet: invoices clear
// on their milestone due day, holds allow 3 days for payer approval and
// dispatch allows 2 days for capture and tracking.
function gateDay(g: NonNullable<Template["gate"]>, f: ScheduleFacts, depsEnd: number): number {
  if (g.kind === "invoice") return f.trancheDueDay[g.ref] ?? 0;
  return depsEnd + (g.kind === "hold" ? 3 : 2);
}

export function computeSchedule(brief: Brief, f: ScheduleFacts): Task[] {
  const tpl = templates(brief);
  const end: Record<string, number> = {};
  const tasks: Task[] = [];
  for (const t of tpl) {
    const depsEnd = Math.max(0, ...t.deps.map((d) => end[d] ?? 0));
    const satisfied = t.gate ? gateMet(t.gate, f) : true;
    let start = depsEnd;
    if (t.gate && !satisfied) start = Math.max(depsEnd, gateDay(t.gate, f, depsEnd));
    if (t.id === "furniture" || t.id === "network") {
      if (f.disputeOpen) start += 5; // disputed goods are quarantined pending evidence
    }
    const duration = t.duration(f);
    end[t.id] = start + duration;
    tasks.push({
      id: t.id,
      name: t.name,
      resource: t.resource,
      start,
      duration,
      deps: t.deps,
      gate: t.gate ? { ...t.gate, satisfied } : undefined,
      status: satisfied ? "ready" : "blocked",
      critical: false,
    });
  }

  // Backward pass: latest finish without moving the project end.
  const projectEnd = Math.max(...tasks.map((t) => t.start + t.duration));
  const latestFinish: Record<string, number> = {};
  for (const t of [...tasks].reverse()) {
    const successors = tasks.filter((s) => s.deps.includes(t.id));
    latestFinish[t.id] = successors.length ? Math.min(...successors.map((s) => latestFinish[s.id] - s.duration)) : projectEnd;
    t.critical = latestFinish[t.id] - (t.start + t.duration) === 0;
  }
  // Downstream of a blocked gate is blocked too.
  for (const t of tasks) {
    if (t.deps.some((d) => tasks.find((x) => x.id === d)?.status === "blocked")) t.status = "blocked";
  }
  return tasks;
}

export function diffSchedules(before: Task[], after: Task[]): { taskId: string; from: number; to: number }[] {
  return after
    .map((t) => ({ taskId: t.id, from: before.find((b) => b.id === t.id)?.start ?? t.start, to: t.start }))
    .filter((d) => d.from !== d.to);
}
