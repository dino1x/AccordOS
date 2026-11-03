import type { Brief } from "../types.js";
import { aiParseBrief, type ParsedBrief } from "./ai.js";

export const SAMPLE_BRIEF = `Client: Northbank Community Trust (ops@northbank-trust.com)
Project: Fit out the Harbor Street community workspace, 32 seats, opening in six weeks.
Total budget: $64,000 USD. Start: Monday.

Scope:
- 32 height-adjustable desks
- 32 ergonomic task chairs
- 4 wifi 7 access points and one 24-port PoE switch
- 2 conference room displays, 65 inch
- 1 rack UPS battery backup

Payment schedule:
- 30% deposit on signature (day 0)
- 40% on hardware installed and network live (day 21)
- 30% on handover and snag list closed (day 35)
Early payment: 2% off if a tranche is paid within 10 days. Net 30.`;

const CATEGORY_HINTS: [RegExp, string, number][] = [
  [/desk/i, "furniture", 650],
  [/chair/i, "furniture", 420],
  [/access point|wifi|switch|router|poe/i, "network", 900],
  [/display|tv|monitor|screen|projector/i, "av", 1600],
  [/ups|battery|power/i, "power", 1800],
  [/laptop|computer|pc|workstation/i, "compute", 1400],
];

// Deterministic parser used when no Claude key is configured, or when Claude fails.
export function parseBriefDeterministic(text: string): ParsedBrief {
  const budgetMatch = text.match(/\$\s?([\d,]+(?:\.\d+)?)\s*(k)?/i);
  let budget = budgetMatch ? Number(budgetMatch[1].replace(/,/g, "")) : 25000;
  if (budgetMatch?.[2]) budget *= 1000;
  const clientLine = text.match(/client:\s*([^\n(]+)(?:\(([^)]+)\))?/i);
  const projectLine = text.match(/project:\s*([^\n.]+)/i);

  const milestones = [...text.matchAll(/(\d{1,3})%\s+([^(\n]+?)\s*\(day\s*(\d+)\)/gi)].map((m) => ({
    name: sentenceCase(m[2].replace(/^on\s+/i, "").split(/\s+and\s+/i)[0].trim()),
    pct: Number(m[1]),
    dueDay: Number(m[3]),
    deliverable: m[2].trim(),
  }));
  const pctSum = milestones.reduce((s, m) => s + m.pct, 0);

  const lineItems = text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s*\d+\s+[a-z]/i.test(l))
    .flatMap((l) => {
      const parts = l.replace(/^[-*]\s*/, "").split(/\s+and\s+(?:one\s+)?/i);
      return parts.map((p) => {
        const qtyMatch = p.match(/^(\d+)\s+(.*)$/);
        const qty = qtyMatch ? Number(qtyMatch[1]) : 1;
        const query = (qtyMatch ? qtyMatch[2] : p).replace(/,.*$/, "").trim();
        const hint = CATEGORY_HINTS.find(([re]) => re.test(query));
        return { query, qty, category: hint?.[1] ?? "other", maxUnit: hint?.[2] ?? 500 };
      });
    });

  const early = text.match(/(\d+(?:\.\d+)?)%\s*off[^.\n]*?within\s+(\d+)\s+days/i);
  const net = text.match(/net\s+(\d+)/i);

  return {
    title: projectLine ? projectLine[1].trim() : "Untitled project",
    clientName: clientLine ? clientLine[1].trim() : "Client",
    clientEmail: clientLine?.[2]?.trim() ?? "",
    budget,
    startDate: new Date().toISOString().slice(0, 10),
    milestones:
      milestones.length && pctSum === 100
        ? milestones
        : [
            { name: "Deposit", pct: 30, dueDay: 0, deliverable: "Signature" },
            { name: "Delivery", pct: 40, dueDay: 21, deliverable: "Goods installed" },
            { name: "Handover", pct: 30, dueDay: 35, deliverable: "Handover" },
          ],
    lineItems: lineItems.length ? lineItems : [{ query: "office desk", qty: 10, category: "furniture", maxUnit: 650 }],
    earlyPayDiscountPct: early ? Number(early[1]) : 2,
    earlyPayDays: early ? Number(early[2]) : 10,
    netDays: net ? Number(net[1]) : 30,
  };
}

function sentenceCase(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export async function parseBrief(text: string, opts?: { fastBoot?: boolean }): Promise<Brief> {
  const today = new Date().toISOString().slice(0, 10);
  const ai = opts?.fastBoot ? null : await aiParseBrief(text, today);
  const parsed = ai && validParsed(ai) ? ai : parseBriefDeterministic(text);
  const id = `brf${hash(text).toString(36)}`;
  return {
    id,
    title: parsed.title,
    client: { name: parsed.clientName, email: parsed.clientEmail || "ap@northbank-trust.com" },
    budget: Math.round(parsed.budget),
    currency: "USD",
    startDate: today,
    milestones: parsed.milestones.map((m, i) => ({ ...m, id: `m${i + 1}` })),
    lineItems: parsed.lineItems.map((l, i) => {
      const hint = CATEGORY_HINTS.find(([re]) => re.test(l.query));
      return {
        ...l,
        id: `li${i + 1}`,
        qty: Math.max(1, Math.round(l.qty)),
        category: hint?.[1] ?? l.category ?? "other",
        maxUnit: Math.max(Number(l.maxUnit) || 0, hint?.[2] ?? 500),
      };
    }),
    terms: { earlyPayDiscountPct: parsed.earlyPayDiscountPct, earlyPayDays: parsed.earlyPayDays, netDays: parsed.netDays },
    // Fast boot skips Claude, so the seeded brief is honestly labelled as rule-parsed.
    source: ai && parsed === ai ? "claude" : "deterministic",
    rawText: text,
  };
}

function validParsed(p: ParsedBrief): boolean {
  const sum = p.milestones.reduce((s, m) => s + m.pct, 0);
  return p.budget > 0 && p.milestones.length > 0 && Math.abs(sum - 100) < 0.5 && p.lineItems.length > 0;
}

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
