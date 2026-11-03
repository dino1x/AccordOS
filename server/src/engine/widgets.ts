import type { Widget } from "../types.js";
import { aiWidgetIntent, type WidgetIntent } from "./ai.js";

// Keyword fallback for the natural-language widget spawner.
export function widgetIntentDeterministic(prompt: string): WidgetIntent {
  const p = prompt.toLowerCase();
  const pct = (re: RegExp) => {
    const m = p.match(re);
    return m ? Number(m[1]) * (/(drop|fall|weaken|down|-)/.test(m[0]) ? -1 : 1) : 0;
  };
  if (/(owe|unpaid|overdue|late|nudge|remind|chase|receivable)/.test(p)) {
    const days = p.match(/(\d+)\s*days?/);
    return { kind: "nudge", title: "Unpaid Invoice Nudge Scoreboard", fxShiftPct: 0, costShiftPct: 0, zThreshold: 2, minDaysOverdue: days ? Number(days[1]) : 0 };
  }
  if (/(margin|fx|currency|euro|gbp|cliff|cost (rise|increase|goes up)|exchange)/.test(p)) {
    return {
      kind: "margin",
      title: "FX and Margin Cliff Calculator",
      fxShiftPct: pct(/(?:fx|currency|dollar|usd|euro|gbp)[^\d-]*(-?\d+(?:\.\d+)?)\s*%/) || pct(/(-?\d+(?:\.\d+)?)\s*%\s*(?:fx|currency|move|swing|drop|fall)/),
      costShiftPct: pct(/cost[^\d-]*(-?\d+(?:\.\d+)?)\s*%/),
      zThreshold: 2,
      minDaysOverdue: 0,
    };
  }
  const z = p.match(/(\d+(?:\.\d+)?)\s*(?:sigma|std|z)/);
  return { kind: "anomaly", title: "Anomaly Alert Radar", fxShiftPct: 0, costShiftPct: 0, zThreshold: z ? Number(z[1]) : 2, minDaysOverdue: 0 };
}

let seq = 0;

export async function spawnWidget(prompt: string, opts?: { fastBoot?: boolean }): Promise<Widget> {
  const ai = opts?.fastBoot ? null : await aiWidgetIntent(prompt);
  const intent = ai ?? widgetIntentDeterministic(prompt);
  return {
    id: `w${++seq}`,
    kind: intent.kind,
    title: intent.title,
    prompt,
    source: ai ? "claude" : "deterministic",
    params: { fxShiftPct: intent.fxShiftPct, costShiftPct: intent.costShiftPct, zThreshold: intent.zThreshold || 2, minDaysOverdue: intent.minDaysOverdue },
  };
}
