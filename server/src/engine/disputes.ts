import type { AppState, Dispute, Dossier } from "../types.js";
import { aiDisputeSummary } from "./ai.js";

export async function buildDossier(state: AppState, dispute: Dispute): Promise<Omit<Dossier, "submitted" | "submitNote">> {
  const hold = state.holds.find((h) => h.id === dispute.holdId);
  const auction = state.auctions.find((a) => a.id === hold?.auctionId);
  const tranche = state.tranches[0];
  const evidence = [
    { label: "Signed scope and tranche invoice", ref: tranche?.invoiceId ?? "n/a", detail: `${tranche?.name ?? "Deposit"} invoice ${tranche?.invoiceNumber ?? ""}, status ${tranche?.status ?? "unknown"}` },
    { label: "Policy-approved purchase intent", ref: hold?.orderId ?? "n/a", detail: auction ? `${auction.qty} x ${auction.sku.title} from ${auction.vendors.find((v) => v.id === auction.winnerId)?.name}, ${auction.policy.rules.filter((r) => r.pass).length}/${auction.policy.rules.length} policy rules passed` : "No auction record" },
    { label: "Capture record", ref: hold?.captureId ?? "n/a", detail: `$${hold?.amount.toFixed(2) ?? "0.00"} captured after human approval` },
    { label: "Carrier tracking", ref: hold?.tracking?.number ?? "n/a", detail: hold?.tracking ? `${hold.tracking.carrier}, ${hold.tracking.status}` : "No tracking on file" },
    { label: "Schedule acceptance", ref: "acceptance", detail: `Acceptance walk scheduled day ${state.tasks.find((t) => t.id === "acceptance")?.start ?? "?"}` },
  ];
  const facts = `Dispute ${dispute.id}, reason ${dispute.reason}, amount $${dispute.amount.toFixed(2)}.\n` + evidence.map((e) => `- ${e.label} (${e.ref}): ${e.detail}`).join("\n");
  const ai = await aiDisputeSummary(facts);
  const summary =
    ai ??
    `The goods in dispute ${dispute.id} were ordered under a policy-approved hold (${hold?.orderId ?? "n/a"}), captured only after human approval (${hold?.captureId ?? "n/a"}), ` +
      `and shipped with carrier tracking (${hold?.tracking?.number ?? "n/a"}). The client's signed scope and tranche invoice (${tranche?.invoiceId ?? "n/a"}) cover this purchase. We request the claim be closed in the seller's favour.`;
  return { summary, evidence, source: ai ? "claude" : "deterministic" };
}
