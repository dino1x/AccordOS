// Three vendor agents run a sealed-strategy reverse auction for one line item.
// Each agent has a private cost floor and a concession style; the buyer scores
// bids on landed cost plus a delivery-delay penalty minus a reliability credit.
// Deterministic: the same inputs always produce the same rounds.
import type { Auction, Bid, LineItem, Sku, VendorAgent } from "../types.js";

interface VendorModel extends VendorAgent {
  specialty: RegExp;
  opening: number;
  floor: number;
  step: number;
  sla: number;
  minSla: number;
}

export const VENDORS: VendorModel[] = [
  { id: "atlas", name: "Atlas Supply Co", strategy: "Undercuts hard, ships slow", payeeEmail: "ar@atlas-workspace.com", reliability: 0.91, opening: 1.04, floor: 0.84, step: 0.035, sla: 10, minSla: 8, specialty: /desk|table|furniture/i },
  { id: "meridian", name: "Meridian Wholesale", strategy: "Matches the leader, steady SLA", payeeEmail: "billing@meridian-supply.com", reliability: 0.96, opening: 1.0, floor: 0.88, step: 0.02, sla: 6, minSla: 5, specialty: /chair|ups|battery|power/i },
  { id: "kestrel", name: "Kestrel Direct", strategy: "Sells speed, concedes slowly", payeeEmail: "ops@kestrel-direct.com", reliability: 0.98, opening: 1.09, floor: 0.93, step: 0.015, sla: 3, minSla: 2, specialty: /access point|wi-?fi|switch|display|network/i },
];

export const TARGET_SLA = 5;
const DELAY_COST_PER_DAY = 0.006; // share of order value lost per day beyond target

function score(total: number, sla: number, reliability: number): number {
  const delay = Math.max(0, sla - TARGET_SLA) * DELAY_COST_PER_DAY * total;
  const credit = (reliability - 0.9) * 0.5 * total;
  return Math.round((total + delay - credit) * 100) / 100;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function runAuction(id: string, li: LineItem, sku: Sku): Omit<Auction, "policy"> {
  const qty = li.qty;
  // A vendor with a category specialty buys that line cheaper, so it opens and floors lower.
  const edge = (v: VendorModel) => (v.specialty.test(`${li.query} ${li.category} ${sku.title}`) ? 0.07 : 0);
  const state = VENDORS.map((v) => ({ v, factor: v.opening - edge(v), floor: v.floor - edge(v), sla: v.sla, out: false }));
  const rounds: Bid[][] = [];
  const bidOf = (s: (typeof state)[number], round: number, note: string): Bid => {
    const unitPrice = round2(sku.price * s.factor);
    const total = round2(unitPrice * qty);
    return { round, vendorId: s.v.id, unitPrice, total, slaDays: s.sla, score: score(total, s.sla, s.v.reliability), note, withdrawn: s.out };
  };

  rounds.push(state.map((s) => bidOf(s, 0, `Opens at ${Math.round(s.factor * 100)}% of list, ${s.sla}-day delivery${s.floor < s.v.floor ? " (category specialist)" : ""}`)));

  for (let r = 1; r <= 14; r++) {
    const last = rounds[rounds.length - 1];
    const leader = [...last].filter((b) => !b.withdrawn).sort((a, b) => a.score - b.score)[0];
    let moved = false;
    const bids = state.map((s) => {
      if (s.out) return bidOf(s, r, "Out");
      if (s.v.id === leader.vendorId) return bidOf(s, r, "Holds as leader");
      // Concede price first; Kestrel also trades a day of SLA when price is near floor.
      const nextFactor = Math.max(s.floor, s.factor - s.v.step);
      if (nextFactor < s.factor - 1e-9) {
        s.factor = nextFactor;
        moved = true;
        const b = bidOf(s, r, `Cuts to ${Math.round(s.factor * 100)}% of list`);
        if (b.score < leader.score) b.note += ", takes the lead";
        return b;
      }
      if (s.sla > s.v.minSla) {
        s.sla -= 1;
        moved = true;
        return bidOf(s, r, `At price floor, offers ${s.sla}-day delivery`);
      }
      s.out = true;
      return bidOf(s, r, "Withdraws: floor reached");
    });
    rounds.push(bids);
    if (!moved) break;
  }

  const final = rounds[rounds.length - 1].filter((b) => !b.withdrawn);
  const pool = final.length ? final : rounds[rounds.length - 1];
  const winningBid = [...pool].sort((a, b) => a.score - b.score)[0];
  const openingTotal = Math.min(...rounds[0].map((b) => b.total));
  return {
    id,
    lineItemId: li.id,
    sku,
    qty,
    vendors: VENDORS.map(({ id, name, strategy, payeeEmail, reliability }) => ({ id, name, strategy, payeeEmail, reliability })),
    rounds,
    winnerId: winningBid.vendorId,
    winningBid,
    openingTotal,
    savings: round2(openingTotal - winningBid.total),
  };
}
