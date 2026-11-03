// One entry point per PayPal capability. In live mode each call hits the PayPal
// Sandbox (APIMatic SDK for Orders/Payments, REST for the rest). In replay mode
// a deterministic simulator returns PayPal-shaped responses so the product
// runs with zero keys. Every call, live or replayed, lands in telemetry.
import QRCode from "qrcode";
import { config, paypalMode } from "../config.js";
import { record } from "../telemetry.js";
import { PayPalError, rest, withRetry } from "./rest.js";
import { sdkAddTracking, sdkAuthorizeOrder, sdkCaptureAuthorization, sdkCaptureOrder, sdkCreateOrder, sdkGetOrder, sdkVoidAuthorization } from "./sdk.js";

const live = () => paypalMode === "live";

// Deterministic id source for replay mode: same sequence of calls, same ids.
let replaySeq = 0;
function rid(prefix: string, length: number): string {
  replaySeq += 1;
  let x = (replaySeq * 2654435761) >>> 0;
  let out = "";
  const alphabet = "0123456789ABCDEFGHJKLMNPQRSTUVWXYZ";
  while (out.length < length) {
    x = (x * 1103515245 + 12345) >>> 0;
    out += alphabet[x % alphabet.length];
  }
  return `${prefix}${out}`;
}

function replay<T>(method: string, path: string, mcpTool: string, request: unknown, response: T, status = 201): T {
  record({ origin: "replay", mcpTool, method, path, status, ms: Math.round((0.4 + (replaySeq % 7) * 0.1) * 10) / 10, request, response });
  return response;
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function qrDataUrl(text: string): Promise<string> {
  return QRCode.toDataURL(text, { margin: 1, width: 320, color: { dark: "#0F1114", light: "#FFFFFF" } });
}

// ---------- Invoicing v2 ----------

// Arguments follow the official PayPal Agent Toolkit `create_invoice` schema.
export interface InvoiceDraft {
  currency_code: string;
  invoice_number?: string;
  invoice_date?: string;
  reference?: string;
  note?: string;
  invoicer_business_name?: string;
  primary_recipients?: { billing_info?: { business_name?: string; email_address?: string } }[];
  items: { name: string; description?: string; quantity: string | number; unit_amount: { currency_code: string; value: string } }[];
  allow_partial_payment?: boolean;
  minimum_partial_payment_amount?: number;
}

const replayInvoices = new Map<string, string>();
const payerUrlFor = (id: string) => `https://www.sandbox.paypal.com/invoice/p/#${id.replace(/^INV2-/, "").replace(/-/g, "")}`;

export async function createInvoice(d: InvoiceDraft) {
  const body = {
    detail: {
      currency_code: d.currency_code,
      invoice_number: d.invoice_number,
      reference: d.reference,
      invoice_date: d.invoice_date ?? isoDate(new Date()),
      note: d.note,
    },
    invoicer: { business_name: d.invoicer_business_name },
    primary_recipients: d.primary_recipients,
    items: d.items.map((it) => ({ ...it, quantity: String(it.quantity), unit_of_measure: "AMOUNT" })),
    configuration: {
      partial_payment: d.allow_partial_payment
        ? { allow_partial_payment: true, minimum_amount_due: { currency_code: d.currency_code, value: (d.minimum_partial_payment_amount ?? 0).toFixed(2) } }
        : { allow_partial_payment: false },
      allow_tip: false,
    },
  };
  if (!live()) {
    const id = rid("INV2-", 16).replace(/(.{9})(.{4})(.{4})(.{4})/, "$1-$2-$3-$4");
    replayInvoices.set(id, "DRAFT");
    return replay("POST", "/v2/invoicing/invoices", "create_invoice", body, { invoiceId: id, status: "DRAFT" });
  }
  const created = await rest<any>("POST", "/v2/invoicing/invoices", body, { mcpTool: "create_invoice" });
  return { invoiceId: (created.data.id ?? String(created.data.href ?? "").split("/").pop()) as string, status: "DRAFT" };
}

export async function sendInvoice(invoiceId: string, note?: string) {
  const body = { send_to_invoicer: false, send_to_recipient: true, note };
  if (!live()) {
    replayInvoices.set(invoiceId, "SENT");
    return replay("POST", `/v2/invoicing/invoices/${invoiceId}/send`, "send_invoice", body, { status: "SENT" }, 200);
  }
  // A lost response may hide a send that succeeded, so check the invoice before resending.
  await withRetry(`send ${invoiceId}`, async (attempt) => {
    if (attempt > 1 && (await invoiceStatus(invoiceId)) !== "DRAFT") return;
    await rest("POST", `/v2/invoicing/invoices/${invoiceId}/send`, body, { mcpTool: "send_invoice", retry: false });
  });
  return { status: "SENT" };
}

async function invoiceStatus(invoiceId: string): Promise<string> {
  const res = await rest<any>("GET", `/v2/invoicing/invoices/${invoiceId}`, undefined, { mcpTool: "get_invoice" });
  return String(res.data.status ?? "");
}

export async function getInvoice(invoiceId: string) {
  if (!live()) return replay("GET", `/v2/invoicing/invoices/${invoiceId}`, "get_invoice", { invoiceId }, { invoiceId, status: replayInvoices.get(invoiceId) ?? "UNKNOWN", payerViewUrl: payerUrlFor(invoiceId) }, 200);
  const res = await rest<any>("GET", `/v2/invoicing/invoices/${invoiceId}`, undefined, { mcpTool: "get_invoice" });
  return { invoiceId, status: res.data.status as string, payerViewUrl: (res.data?.detail?.metadata?.recipient_view_url as string) ?? payerUrlFor(invoiceId) };
}

export async function invoiceQr(invoiceId: string, width = 320, height = 320): Promise<{ dataUrl: string; source: "paypal" | "local" }> {
  if (live()) {
    try {
      const res = await rest<string>("POST", `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`, { width, height, action: "pay" }, { mcpTool: "generate_invoice_qr_code", raw: true });
      const match = String(res.data).replace(/\s+/g, "").match(/iVBOR[A-Za-z0-9+/=]+/);
      if (match) return { dataUrl: `data:image/png;base64,${match[0]}`, source: "paypal" };
    } catch {
      // fall through to a locally rendered QR of the same payer URL
    }
  } else {
    replay("POST", `/v2/invoicing/invoices/${invoiceId}/generate-qr-code`, "generate_invoice_qr_code", { width, height }, "[png base64]", 200);
  }
  return { dataUrl: await qrDataUrl(payerUrlFor(invoiceId)), source: "local" };
}

export async function remindInvoice(invoiceId: string, note: string, subject = "Payment reminder") {
  const body = { subject, note, send_to_invoicer: false };
  if (!live()) return replay("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, "send_invoice_reminder", body, { status: 204 }, 204);
  await rest("POST", `/v2/invoicing/invoices/${invoiceId}/remind`, body, { mcpTool: "send_invoice_reminder" });
  return { status: 204 };
}

export async function recordInvoicePayment(invoiceId: string, amount: number) {
  const body = { method: "PAYPAL", payment_date: isoDate(new Date()), amount: { currency_code: "USD", value: amount.toFixed(2) }, note: "Recorded by AccordOS" };
  if (!live()) return replay("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, "record_invoice_payment", body, { payment_id: rid("EXTR-", 12) }, 200);
  // Never record a payment twice: before a retry, check whether the first attempt landed.
  return withRetry(`record payment ${invoiceId}`, async (attempt) => {
    if (attempt > 1) {
      const inv = await rest<any>("GET", `/v2/invoicing/invoices/${invoiceId}`, undefined, { mcpTool: "get_invoice" });
      const paid = Number(inv.data?.payments?.paid_amount?.value ?? 0);
      if (paid >= amount - 0.005) return { payment_id: String(inv.data.payments.transactions?.at(-1)?.payment_id ?? "already-recorded") };
    }
    const res = await rest<any>("POST", `/v2/invoicing/invoices/${invoiceId}/payments`, body, { mcpTool: "record_invoice_payment", retry: false });
    return { payment_id: res.data.payment_id as string };
  });
}

// ---------- Orders v2 (APIMatic SDK) ----------

export async function createOrder(intent: "AUTHORIZE" | "CAPTURE", amount: number, referenceId: string, description: string) {
  if (!live()) {
    const orderId = rid("", 17);
    return replay("POST", "/v2/checkout/orders", "create_order", { intent, amount, referenceId }, {
      orderId,
      status: "PAYER_ACTION_REQUIRED",
      approveUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`,
    });
  }
  return sdkCreateOrder(intent, amount, referenceId, description);
}

// Live Sandbox fast-forward: when nobody approved the order in the PayPal
// popup, PayPal answers 422 ORDER_NOT_APPROVED. The hold is then simulated,
// with an AUTH- id and a `fastForwarded` flag the UI and ledger label. Any
// other failure is real and is thrown.
const FAST_FORWARD_AUTH = "AUTH-";
const FAST_FORWARD_CAPTURE = "CAP-";

function isOrderNotApproved(err: unknown): boolean {
  if (!(err instanceof PayPalError)) return false;
  return /ORDER_NOT_APPROVED/.test(`${err.message} ${JSON.stringify(err.body ?? "")}`);
}

export async function authorizeOrder(orderId: string): Promise<{ authorizationId: string; status: string; fastForwarded?: boolean }> {
  if (!live()) return replay("POST", `/v2/checkout/orders/${orderId}/authorize`, "authorize_order", { id: orderId }, { authorizationId: rid("", 17), status: "CREATED" });
  try {
    return await sdkAuthorizeOrder(orderId);
  } catch (err) {
    if (!isOrderNotApproved(err)) throw err;
    return replay("POST", `/v2/checkout/orders/${orderId}/authorize`, "authorize_order", { id: orderId, note: "sandbox_fast_forward" }, { authorizationId: rid(FAST_FORWARD_AUTH, 13), status: "CREATED", fastForwarded: true });
  }
}

export async function captureOrder(orderId: string) {
  if (!live()) return replay("POST", `/v2/checkout/orders/${orderId}/capture`, "capture_order", { id: orderId }, { captureId: rid("", 17), status: "COMPLETED" });
  return sdkCaptureOrder(orderId);
}

export async function getOrder(orderId: string) {
  if (!live()) return replay("GET", `/v2/checkout/orders/${orderId}`, "get_order", { id: orderId }, { orderId, status: "APPROVED", trackers: [] as { id: string; status: string }[] }, 200);
  return sdkGetOrder(orderId);
}

export async function captureAuthorization(authorizationId: string, amount: number): Promise<{ captureId: string; status: string; fastForwarded?: boolean }> {
  if (!live()) return replay("POST", `/v2/payments/authorizations/${authorizationId}/capture`, "capture_authorized_payment", { amount }, { captureId: rid("", 17), status: "COMPLETED" });
  if (authorizationId.startsWith(FAST_FORWARD_AUTH)) {
    return replay("POST", `/v2/payments/authorizations/${authorizationId}/capture`, "capture_authorized_payment", { amount, note: "sandbox_fast_forward" }, { captureId: rid(FAST_FORWARD_CAPTURE, 13), status: "COMPLETED", fastForwarded: true });
  }
  return sdkCaptureAuthorization(authorizationId, amount);
}

export async function voidAuthorization(authorizationId: string) {
  if (!live() || authorizationId.startsWith(FAST_FORWARD_AUTH)) {
    return replay("POST", `/v2/payments/authorizations/${authorizationId}/void`, "void_authorized_payment", { authorizationId, note: live() ? "sandbox_fast_forward" : undefined }, { status: "VOIDED" }, 204);
  }
  return sdkVoidAuthorization(authorizationId);
}

// ---------- Shipment Tracking ----------

export async function addTracking(orderId: string, captureId: string, carrier: string, trackingNumber: string) {
  // PayPal only accepts tracking against a real capture, so fast-forwarded captures replay it.
  if (!live() || captureId.startsWith(FAST_FORWARD_CAPTURE)) return replay("POST", `/v2/checkout/orders/${orderId}/track`, "create_shipment_tracking", { captureId, carrier, trackingNumber }, { status: "SHIPPED" });
  return sdkAddTracking(orderId, captureId, carrier, trackingNumber);
}

// ---------- Payouts v1 ----------

export async function createPayouts(items: { receiver: string; amount: number; note: string }[]) {
  const buildBody = (scaleToNominal = false) => ({
    sender_batch_header: { sender_batch_id: `accord-${Date.now()}-${scaleToNominal ? "nom" : "full"}`, email_subject: "AccordOS milestone disbursement" },
    items: items.map((it, i) => ({
      recipient_type: "EMAIL",
      amount: { value: scaleToNominal ? "1.00" : it.amount.toFixed(2), currency: "USD" },
      receiver: it.receiver,
      note: scaleToNominal ? `${it.note} (sandbox $1.00 settlement for $${it.amount.toFixed(2)})` : it.note,
      sender_item_id: `item-${i + 1}`,
    })),
  });
  const body = buildBody(false);
  if (!live()) return replay("POST", "/v1/payments/payouts", "create_payout", body, { batchId: rid("", 13), status: "PENDING" });
  try {
    // Money leaving the desk is never retried blindly: a failure surfaces instead of risking a double payout.
    const res = await rest<any>("POST", "/v1/payments/payouts", body, { mcpTool: "create_payout", retry: false });
    return { batchId: res.data.batch_header.payout_batch_id as string, status: res.data.batch_header.batch_status as string };
  } catch (err) {
    if (err instanceof PayPalError && /INSUFFICIENT_FUNDS/i.test(`${err.message} ${JSON.stringify(err.body ?? "")}`)) {
      const res = await rest<any>("POST", "/v1/payments/payouts", buildBody(true), { mcpTool: "create_payout" });
      return { batchId: res.data.batch_header.payout_batch_id as string, status: res.data.batch_header.batch_status as string };
    }
    throw err;
  }
}

// ---------- Disputes v1 ----------

export async function provideDisputeEvidence(disputeId: string, carrier: string, trackingNumber: string, notes: string) {
  const input = {
    evidences: [
      {
        evidence_type: "PROOF_OF_FULFILLMENT",
        evidence_info: { tracking_info: [{ carrier_name: carrier, tracking_number: trackingNumber }] },
        notes: notes.slice(0, 2000),
      },
    ],
  };
  if (!live() || disputeId.startsWith("PP-D-SIM")) {
    replay("POST", `/v1/customer/disputes/${disputeId}/provide-evidence`, "provide_dispute_evidence", input, { status: "UNDER_REVIEW" }, 200);
    return { submitted: false, note: live() ? "Simulated dispute: evidence payload built and replayed, not sent to PayPal." : "Replay mode: evidence payload built and replayed." };
  }
  const form = new FormData();
  form.append("input", new Blob([JSON.stringify(input)], { type: "application/json" }));
  await rest("POST", `/v1/customer/disputes/${disputeId}/provide-evidence`, input, { mcpTool: "provide_dispute_evidence", form, retry: false });
  return { submitted: true, note: "Evidence submitted to PayPal Disputes API." };
}

export async function listOpenDisputes(): Promise<{ id: string; amount: number; reason: string }[]> {
  if (!live()) return [];
  const res = await rest<any>("GET", "/v1/customer/disputes?dispute_state=REQUIRED_ACTION", undefined, { mcpTool: "list_disputes" });
  return (res.data.items ?? []).map((d: any) => ({ id: d.dispute_id, amount: Number(d.dispute_amount?.value ?? 0), reason: d.reason }));
}

export async function getDispute(disputeId: string) {
  if (!live() || disputeId.startsWith("PP-D-SIM")) return replay("GET", `/v1/customer/disputes/${disputeId}`, "get_dispute", { disputeId }, { disputeId, status: "OPEN", simulated: true }, 200);
  const res = await rest<any>("GET", `/v1/customer/disputes/${disputeId}`, undefined, { mcpTool: "get_dispute" });
  return { disputeId, status: res.data.status as string, reason: res.data.reason as string, amount: Number(res.data.dispute_amount?.value ?? 0) };
}

export async function acceptDisputeClaim(disputeId: string, note: string) {
  if (!live() || disputeId.startsWith("PP-D-SIM")) return replay("POST", `/v1/customer/disputes/${disputeId}/accept-claim`, "accept_dispute_claim", { note }, { status: "RESOLVED", simulated: true }, 200);
  await rest("POST", `/v1/customer/disputes/${disputeId}/accept-claim`, { note }, { mcpTool: "accept_dispute_claim" });
  return { status: "ACCEPTED" };
}

// ---------- Webhooks ----------

export async function verifyWebhook(headers: Record<string, string | undefined>, event: unknown): Promise<boolean> {
  if (!live() || !config.paypal.webhookId) return true;
  const body = {
    auth_algo: headers["paypal-auth-algo"],
    cert_url: headers["paypal-cert-url"],
    transmission_id: headers["paypal-transmission-id"],
    transmission_sig: headers["paypal-transmission-sig"],
    transmission_time: headers["paypal-transmission-time"],
    webhook_id: config.paypal.webhookId,
    webhook_event: event,
  };
  const res = await rest<any>("POST", "/v1/notifications/verify-webhook-signature", body, { mcpTool: "verify_webhook_signature" });
  return res.data.verification_status === "SUCCESS";
}
