// The policy vault decides whether an agent proposal may become a PayPal hold.
// It is deterministic code, never a model: the AI proposes, the vault disposes.
import type { Auction, Hold, LineItem, PolicyDecision } from "../types.js";
import { VENDORS } from "./auction.js";

export const HUMAN_APPROVAL_OVER = 5000;

export function evaluateHold(auction: Omit<Auction, "policy">, li: LineItem, procurementBudget: number, holds: Hold[], auctions: Auction[]): PolicyDecision {
  const committed = holds
    .filter((h) => h.status !== "voided" && h.auctionId !== auction.id)
    .reduce((s, h) => s + h.amount, 0);
  const remaining = procurementBudget - committed;
  const amount = auction.winningBid.total;
  const vendor = VENDORS.find((v) => v.id === auction.winnerId);
  const duplicate = auctions.some((a) => a.id !== auction.id && a.lineItemId === li.id && a.holdId);

  const rules = [
    { id: "budget", label: "Within procurement allocation", pass: amount <= remaining, detail: `$${amount.toFixed(2)} of $${remaining.toFixed(2)} remaining` },
    { id: "unit-cap", label: "Unit price under brief ceiling", pass: auction.winningBid.unitPrice <= li.maxUnit, detail: `$${auction.winningBid.unitPrice.toFixed(2)} vs cap $${li.maxUnit.toFixed(2)}` },
    { id: "allowlist", label: "Vendor payee on allowlist", pass: !!vendor, detail: vendor ? vendor.payeeEmail : "Unknown vendor" },
    { id: "no-duplicate", label: "No existing hold for this line", pass: !duplicate, detail: duplicate ? "A hold already exists" : "First hold for this line item" },
    { id: "sla", label: "Delivery inside schedule float", pass: auction.winningBid.slaDays <= 10, detail: `${auction.winningBid.slaDays} days vs 10-day float` },
  ];
  return {
    allowed: rules.every((r) => r.pass),
    requiresHuman: amount > HUMAN_APPROVAL_OVER,
    rules,
  };
}
