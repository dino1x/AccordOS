import type { MoneyState } from "../../../server/src/types";

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export const money = (n: number) => usd.format(n);
export const money0 = (n: number) => usd0.format(n);
export const pct = (n: number, digits = 1) => `${n.toFixed(digits)}%`;

export function time(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function dayLabel(dayZero: string, offset: number): string {
  const d = new Date(`${dayZero}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export const STATE_LABEL: Record<MoneyState, string> = {
  draft: "Proposed",
  invoiced: "Invoiced",
  authorized: "Held",
  captured: "Captured",
  paidout: "Paid out",
  blocked: "Blocked",
  disputed: "Disputed",
};
