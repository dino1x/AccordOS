// Orders v2 and Payments v2 go through the APIMatic-generated PayPal Server SDK.
import {
  ApiError,
  CheckoutPaymentIntent,
  Client,
  Environment,
  OrdersController,
  PaymentsController,
  type ApiResponse,
} from "@paypal/paypal-server-sdk";
import { config } from "../config.js";
import { record, scrub } from "../telemetry.js";
import { randomUUID } from "node:crypto";
import { elapsed, isRetryable, PAYPAL_TIMEOUT_MS, PayPalError, withRetry } from "./rest.js";

let orders: OrdersController | null = null;
let payments: PaymentsController | null = null;

function controllers() {
  if (!orders || !payments) {
    const client = new Client({
      clientCredentialsAuthCredentials: {
        oAuthClientId: config.paypal.clientId,
        oAuthClientSecret: config.paypal.clientSecret,
      },
      environment: Environment.Sandbox,
      timeout: PAYPAL_TIMEOUT_MS,
    });
    orders = new OrdersController(client);
    payments = new PaymentsController(client);
  }
  return { orders, payments: payments! };
}

// Each call is retried on network errors, timeouts, 429 and 5xx. Callers pass
// the same PayPal-Request-Id to every attempt, so PayPal deduplicates retries.
// Calls without idempotency support pass retry=false.
async function traced<T>(method: string, path: string, mcpTool: string, request: unknown, call: () => Promise<ApiResponse<T>>, retry = true): Promise<T> {
  const attempt = async (n: number) => {
    const started = performance.now();
    const label = n > 1 ? `${path} (retry ${n - 1})` : path;
    try {
      const res = await call();
      record({ origin: "apimatic-sdk", mcpTool, method, path: label, status: res.statusCode, ms: elapsed(started), request: scrub(request), response: scrub(res.result) });
      return res.result;
    } catch (err) {
      const status = err instanceof ApiError ? err.statusCode : 0;
      const body = err instanceof ApiError ? err.result ?? err.body : undefined;
      const message = err instanceof Error ? err.message : String(err);
      record({ origin: "apimatic-sdk", mcpTool, method, path: label, status, ms: elapsed(started), request: scrub(request), response: scrub(body), error: message });
      throw new PayPalError(status, message, body);
    }
  };
  return retry ? withRetry(`${method} ${path}`, attempt, isRetryable) : attempt(1);
}

export async function sdkCreateOrder(intent: "AUTHORIZE" | "CAPTURE", amount: number, referenceId: string, description: string) {
  const requestId = randomUUID();
  const body = {
    intent: intent === "AUTHORIZE" ? CheckoutPaymentIntent.Authorize : CheckoutPaymentIntent.Capture,
    purchaseUnits: [
      {
        referenceId,
        description: description.slice(0, 127),
        amount: { currencyCode: "USD", value: amount.toFixed(2) },
      },
    ],
  };
  const result = await traced("POST", "/v2/checkout/orders", "create_order", body, () =>
    controllers().orders.createOrder({ body, prefer: "return=representation", paypalRequestId: requestId }),
  );
  const approve = result.links?.find((l) => l.rel === "approve" || l.rel === "payer-action")?.href;
  return { orderId: result.id!, status: result.status ?? "CREATED", approveUrl: approve };
}

export async function sdkGetOrder(orderId: string) {
  const result = await traced("GET", `/v2/checkout/orders/${orderId}`, "get_order", { id: orderId }, () => controllers().orders.getOrder({ id: orderId }));
  const trackers = (result.purchaseUnits?.[0]?.shipping?.trackers ?? []).map((t) => ({ id: t.id ?? "", status: String(t.status ?? "") }));
  return { orderId, status: String(result.status ?? ""), trackers };
}

export async function sdkAuthorizeOrder(orderId: string) {
  const requestId = randomUUID();
  const result = await traced("POST", `/v2/checkout/orders/${orderId}/authorize`, "authorize_order", { id: orderId }, () =>
    controllers().orders.authorizeOrder({ id: orderId, prefer: "return=representation", paypalRequestId: requestId }),
  );
  const auth = result.purchaseUnits?.[0]?.payments?.authorizations?.[0];
  if (!auth?.id) throw new PayPalError(422, "Authorization id missing from response");
  return { authorizationId: auth.id, status: auth.status ?? "CREATED" };
}

export async function sdkCaptureOrder(orderId: string) {
  const requestId = randomUUID();
  const result = await traced("POST", `/v2/checkout/orders/${orderId}/capture`, "capture_order", { id: orderId }, () =>
    controllers().orders.captureOrder({ id: orderId, prefer: "return=representation", paypalRequestId: requestId }),
  );
  const capture = result.purchaseUnits?.[0]?.payments?.captures?.[0];
  return { captureId: capture?.id ?? "", status: result.status ?? "COMPLETED" };
}

export async function sdkCaptureAuthorization(authorizationId: string, amount: number) {
  const requestId = randomUUID();
  const body = { amount: { currencyCode: "USD", value: amount.toFixed(2) }, finalCapture: true };
  const result = await traced("POST", `/v2/payments/authorizations/${authorizationId}/capture`, "capture_authorized_payment", body, () =>
    controllers().payments.captureAuthorizedPayment({ authorizationId, body, prefer: "return=representation", paypalRequestId: requestId }),
  );
  return { captureId: result.id!, status: result.status ?? "COMPLETED" };
}

export async function sdkVoidAuthorization(authorizationId: string) {
  const requestId = randomUUID();
  await traced("POST", `/v2/payments/authorizations/${authorizationId}/void`, "void_authorized_payment", { authorizationId }, () =>
    controllers().payments.voidPayment({ authorizationId, prefer: "return=representation", paypalRequestId: requestId }),
  );
  return { status: "VOIDED" };
}

export async function sdkAddTracking(orderId: string, captureId: string, carrier: string, trackingNumber: string) {
  const body = { captureId, trackingNumber, carrier: carrier as any, notifyPayer: false };
  await traced("POST", `/v2/checkout/orders/${orderId}/track`, "create_shipment_tracking", body, () =>
    controllers().orders.createOrderTracking({ id: orderId, body }),
    false, // no idempotency key on this endpoint: a duplicate tracker is worse than a reported failure
  );
  return { status: "SHIPPED" };
}
