// Injects network failures into PayPal REST calls and checks that retries
// never duplicate money movements. Uses a stubbed fetch: no real PayPal calls.
// Run with: npm test
import assert from "node:assert/strict";

process.env.PAYPAL_CLIENT_ID ||= "test-client";
process.env.PAYPAL_CLIENT_SECRET ||= "test-secret";

type Call = { method: string; path: string; requestId: string | null };
let calls: Call[] = [];
let script: ((c: Call, n: number) => Response | Error)[] = [];

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const url = new URL(String(input));
  const headers = new Headers(init?.headers);
  const call: Call = { method: init?.method ?? "GET", path: url.pathname, requestId: headers.get("PayPal-Request-Id") };
  if (call.path === "/v1/oauth2/token") return json(200, { access_token: "stub-token", expires_in: 3600 });
  calls.push(call);
  const step = script.shift();
  if (!step) throw new Error(`Unscripted call ${call.method} ${call.path}`);
  const out = step(call, calls.length);
  if (out instanceof Error) throw out;
  return out;
}) as typeof fetch;

const netDown = () => new TypeError("fetch failed");
const gw = await import("../server/src/paypal/gateway.ts");
const { paypalMode } = await import("../server/src/config.ts");
assert.equal(paypalMode, "live", "test runs the live code path");

const run = async (name: string, steps: typeof script, fn: () => Promise<unknown>) => {
  calls = [];
  script = steps;
  let result: unknown;
  let error: unknown;
  try {
    result = await fn();
  } catch (err) {
    error = err;
  }
  assert.equal(script.length, 0, `${name}: every scripted response was used`);
  return { result, error, calls: [...calls] };
};

// 1. Payment landed but the response was lost: the retry must not record it again.
{
  const r = await run("payment landed", [netDown, () => json(200, { status: "PAID", payments: { paid_amount: { value: "100.00" }, transactions: [{ payment_id: "PAY-1" }] } })], () => gw.recordInvoicePayment("INV2-A", 100));
  assert.equal(r.error, undefined);
  assert.equal(r.calls.filter((c) => c.method === "POST").length, 1, "no second payment POST");
  assert.deepEqual(r.result, { payment_id: "PAY-1" });
}

// 2. Payment did not land: the retry records it once.
{
  const r = await run("payment lost", [netDown, () => json(200, { status: "SENT", payments: { paid_amount: { value: "0.00" } } }), () => json(200, { payment_id: "PAY-2" })], () => gw.recordInvoicePayment("INV2-B", 100));
  assert.equal(r.error, undefined);
  assert.equal(r.calls.filter((c) => c.method === "POST").length, 2);
  assert.deepEqual(r.result, { payment_id: "PAY-2" });
}

// 3. Invoice send landed but the response was lost: no second send.
{
  const r = await run("send landed", [netDown, () => json(200, { status: "SENT" })], () => gw.sendInvoice("INV2-C"));
  assert.equal(r.error, undefined);
  assert.equal(r.calls.filter((c) => c.method === "POST").length, 1, "no second send POST");
}

// 4. A 503 then success: both attempts carry the same PayPal-Request-Id.
{
  const r = await run("idempotent retry", [() => json(503, { name: "SERVICE_UNAVAILABLE", message: "down" }), () => new Response(null, { status: 204 })], () => gw.remindInvoice("INV2-D", "note"));
  assert.equal(r.error, undefined);
  assert.equal(r.calls.length, 2);
  assert.ok(r.calls[0].requestId && r.calls[0].requestId === r.calls[1].requestId, "same PayPal-Request-Id on retry");
}

// 5. Payouts are never retried: a network failure surfaces after one attempt.
{
  const r = await run("payout", [netDown], () => gw.createPayouts([{ receiver: "ar@atlas-workspace.com", amount: 10, note: "[procurement] test" }]));
  assert.ok(r.error, "payout failure is reported");
  assert.equal(r.calls.length, 1, "payout attempted exactly once");
}

// 5b. A payout whose connection never opened (connect timeout) is retried: PayPal never saw it.
{
  const connectTimeout = () => Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_CONNECT_TIMEOUT" } });
  const r = await run("payout connect timeout", [connectTimeout, () => json(201, { batch_header: { payout_batch_id: "BATCH-1", batch_status: "PENDING" } })], () => gw.createPayouts([{ receiver: "ar@atlas-workspace.com", amount: 10, note: "[procurement] test" }]));
  assert.equal(r.error, undefined);
  assert.equal(r.calls.length, 2, "retried once after a pre-send failure");
  assert.deepEqual(r.result, { batchId: "BATCH-1", status: "PENDING" });
}

// 6. Business errors (4xx) are not retried.
{
  const r = await run("422", [() => json(422, { name: "UNPROCESSABLE_ENTITY", details: [{ issue: "INVALID_INVOICE_STATUS" }] })], () => gw.remindInvoice("INV2-E", "note"));
  assert.ok(r.error);
  assert.equal(r.calls.length, 1);
}

console.log("ok  PayPal retries: reconcile before re-recording payments and re-sending invoices, same request id on retry, payouts retried only when the request never left");
