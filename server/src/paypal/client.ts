// The orchestrator's only door to PayPal. Each function is one or more MCP
// tool calls; nothing here imports the gateway directly.
import { config } from "../config.js";
import type { Brief, Tranche } from "../types.js";
import { callTool } from "./mcp.js";

export async function issueInvoice(brief: Brief, tranche: Tranche) {
  const invoiceNumber = `ACC-${brief.id.slice(-4).toUpperCase()}-${tranche.milestoneId.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const milestone = brief.milestones.find((m) => m.id === tranche.milestoneId);
  const created = await callTool<{ invoiceId: string }>("create_invoice", {
    currency_code: "USD",
    invoice_number: invoiceNumber,
    invoice_date: new Date().toISOString().slice(0, 10),
    reference: brief.title.slice(0, 120),
    note:
      `Tranche "${tranche.name}" for ${brief.title}. Due ${tranche.dueDate}. ` +
      `Early payment rule: pay within ${tranche.earlyPay.withinDays} days and settle ${tranche.earlyPay.discountedAmount.toFixed(2)} USD (${tranche.earlyPay.discountPct}% off).`,
    invoicer_business_name: "AccordOS Commercial Desk",
    primary_recipients: [{ billing_info: { business_name: brief.client.name, email_address: config.paypal.buyerEmail || brief.client.email } }],
    items: [
      {
        name: tranche.name,
        description: `Milestone tranche: ${milestone?.deliverable ?? tranche.name}`.slice(0, 1000),
        quantity: "1",
        unit_amount: { currency_code: "USD", value: tranche.amount.toFixed(2) },
      },
    ],
    allow_partial_payment: true,
    minimum_partial_payment_amount: tranche.earlyPay.discountedAmount,
  });
  await callTool("send_invoice", { invoice_id: created.invoiceId, send_to_recipient: true });
  const detail = await callTool<{ payerViewUrl: string }>("get_invoice", { invoice_id: created.invoiceId });
  const qr = await callTool<{ dataUrl: string }>("generate_invoice_qr_code", { invoice_id: created.invoiceId, width: 320, height: 320 });
  return { invoiceId: created.invoiceId, invoiceNumber, payerViewUrl: detail.payerViewUrl, qr: qr.dataUrl };
}

export const remindInvoice = (invoiceId: string, note: string) => callTool("send_invoice_reminder", { invoice_id: invoiceId, subject: "Payment reminder", note });

export const recordInvoicePayment = (invoiceId: string, amount: number) => callTool("accordos_record_invoice_payment", { invoice_id: invoiceId, amount });

export const createCheckoutOrder = (amount: number, name: string, description: string) =>
  callTool<{ orderId: string; approveUrl?: string }>("create_order", {
    currencyCode: "USD",
    items: [{ name: name.slice(0, 127), description: description.slice(0, 127), quantity: 1, itemCost: amount, itemTotal: amount }],
  });

export const payOrder = (orderId: string) => callTool<{ captureId: string }>("pay_order", { id: orderId });

export const createHoldOrder = (amount: number, referenceId: string, description: string) =>
  callTool<{ orderId: string; approveUrl?: string }>("accordos_create_authorize_order", { amount, reference_id: referenceId, description });

export const authorizeOrder = (orderId: string) => callTool<{ authorizationId: string; fastForwarded?: boolean }>("accordos_authorize_order", { order_id: orderId });

export const captureAuthorization = (authorizationId: string, amount: number) =>
  callTool<{ captureId: string; fastForwarded?: boolean }>("accordos_capture_authorization", { authorization_id: authorizationId, amount });

export const voidAuthorization = (authorizationId: string) => callTool("accordos_void_authorization", { authorization_id: authorizationId });

export const addTracking = (orderId: string, captureId: string, carrier: string, trackingNumber: string) =>
  callTool("create_shipment_tracking", { order_id: orderId, transaction_id: captureId, tracking_number: trackingNumber, carrier, status: "SHIPPED" });

export async function listOpenDisputes() {
  const res = await callTool<{ items: { id: string; amount: number; reason: string }[] }>("list_disputes", { dispute_state: "REQUIRED_ACTION" });
  return res.items;
}

export const provideDisputeEvidence = (disputeId: string, carrier: string, trackingNumber: string, notes: string) =>
  callTool<{ submitted: boolean; note: string }>("accordos_provide_dispute_evidence", { dispute_id: disputeId, carrier, tracking_number: trackingNumber, notes });

export const createPayouts = (items: { receiver: string; amount: number; note: string }[]) =>
  callTool<{ batchId: string; status: string }>("accordos_create_payout", { items });
