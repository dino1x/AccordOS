// Multiple-choice knapsack solved by dynamic programming: pick exactly one
// option per category (procurement tier, crew plan, contingency reserve) so
// that total cost stays within budget and total utility is maximal. Costs are
// discretised to UNIT dollars; the answer is exact at that resolution.
import type { AllocCategory, AllocOption, Allocation, Brief } from "../types.js";

const UNIT = 50;
const LABOR_RATE = 62;

export function buildOptions(brief: Brief): Omit<AllocCategory, "chosen">[] {
  const procurementEstimate = brief.lineItems.reduce((s, li) => s + li.qty * li.maxUnit * 0.78, 0);
  const procurement: AllocOption[] = [
    { label: "Value tier", cost: procurementEstimate * 0.82, utility: 58, detail: "Lowest-cost SKUs that meet spec" },
    { label: "Standard tier", cost: procurementEstimate, utility: 80, detail: "Mid-market SKUs, 3-year warranty" },
    { label: "Premium tier", cost: procurementEstimate * 1.22, utility: 91, detail: "Top-rated SKUs, 5-year warranty" },
  ];
  const crewHours = Math.max(80, brief.lineItems.reduce((s, li) => s + li.qty, 0) * 2.5);
  const crew: AllocOption[] = [2, 3, 4].map((n, i) => {
    const days = Math.ceil(crewHours / (n * 8));
    // Bigger crews finish faster but lose some efficiency to coordination.
    const cost = crewHours * LABOR_RATE * (1 + i * 0.06);
    return { label: `${n} installers x ${days} days`, cost, utility: [54, 74, 83][i], detail: `${Math.round(crewHours)} labour hours at $${LABOR_RATE}/h` };
  });
  const contingency: AllocOption[] = [5, 8, 10, 12, 15].map((pct, i) => ({
    label: `${pct}% reserve`,
    cost: (brief.budget * pct) / 100,
    utility: [36, 60, 70, 76, 79][i],
    detail: "Held back for overruns, FX and change orders",
  }));
  return [
    { key: "procurement", label: "Procurement", options: procurement },
    { key: "crew", label: "Crew milestones", options: crew },
    { key: "contingency", label: "Contingency reserve", options: contingency },
  ];
}

export function allocate(brief: Brief): Allocation {
  const started = performance.now();
  const cats = buildOptions(brief).map((c) => ({ ...c, options: c.options.map((o) => ({ ...o, cost: Math.round(o.cost * 100) / 100 })) }));
  const cap = Math.floor(brief.budget / UNIT);
  const NEG = -Infinity;

  // best[c][b] = max utility using categories 0..c-1 with at most b units spent.
  let prev = new Float64Array(cap + 1); // zero categories: utility 0 at any budget
  const choice: Int16Array[] = [];
  let states = 0;
  for (const cat of cats) {
    const next = new Float64Array(cap + 1).fill(NEG);
    const pick = new Int16Array(cap + 1).fill(-1);
    for (let b = 0; b <= cap; b++) {
      for (let o = 0; o < cat.options.length; o++) {
        const w = Math.ceil(cat.options[o].cost / UNIT);
        states++;
        if (w > b || prev[b - w] === NEG) continue;
        const v = prev[b - w] + cat.options[o].utility;
        if (v > next[b]) {
          next[b] = v;
          pick[b] = o;
        }
      }
    }
    choice.push(pick);
    prev = next;
  }

  const feasible = prev[cap] !== NEG;
  const chosenIdx: number[] = new Array(cats.length).fill(0);
  if (feasible) {
    let b = cap;
    for (let c = cats.length - 1; c >= 0; c--) {
      const o = choice[c][b];
      chosenIdx[c] = o;
      b -= Math.ceil(cats[c].options[o].cost / UNIT);
    }
  }
  const categories: AllocCategory[] = cats.map((c, i) => ({ ...c, chosen: c.options[chosenIdx[i]] }));
  const total = categories.reduce((s, c) => s + c.chosen.cost, 0);
  return {
    budget: brief.budget,
    unit: UNIT,
    categories,
    total: Math.round(total * 100) / 100,
    utility: categories.reduce((s, c) => s + c.chosen.utility, 0),
    statesExplored: states,
    micros: Math.round((performance.now() - started) * 1000),
    feasible,
  };
}

export function categoryBudget(a: Allocation | null, key: AllocCategory["key"]): number {
  return a?.categories.find((c) => c.key === key)?.chosen.cost ?? 0;
}
