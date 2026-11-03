import { randomUUID } from "node:crypto";
import { config } from "../config.js";
import { record, scrub } from "../telemetry.js";

// PayPal Sandbox can be slow (seconds per call) and occasionally drops a
// connection. Every call gets a 30 s timeout and up to two retries on
// network errors, timeouts, 429 and 5xx. POSTs carry one PayPal-Request-Id
// across all attempts, so PayPal treats a retry as the same request.
export const PAYPAL_TIMEOUT_MS = 30_000;
const RETRY_DELAYS_MS = [400, 1200];

let cached: { token: string; expires: number } | null = null;

function basicAuth(): string {
  return Buffer.from(`${config.paypal.clientId}:${config.paypal.clientSecret}`).toString("base64");
}

export class PayPalError extends Error {
  // True when the connection failed before the request was sent, so PayPal never saw it.
  notSent = false;
  constructor(public status: number, message: string, public body?: unknown) {
    super(message);
  }
}

// Connection-phase failures: the request never left this machine.
const NOT_SENT_CODES = new Set(["UND_ERR_CONNECT_TIMEOUT", "ECONNREFUSED", "ENOTFOUND", "EAI_AGAIN", "EHOSTUNREACH", "ENETUNREACH"]);

export const neverSent = (err: unknown) => err instanceof PayPalError && err.notSent;

export function elapsed(started: number): number {
  return Math.round((performance.now() - started) * 10) / 10;
}

// Status 0 means the request never got an HTTP response (network failure or timeout).
export function isRetryable(err: unknown): boolean {
  if (err instanceof PayPalError) return err.status === 0 || err.status === 408 || err.status === 429 || err.status >= 500;
  return err instanceof TypeError || (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError"));
}

export async function withRetry<T>(label: string, fn: (attempt: number) => Promise<T>, retryable: (err: unknown) => boolean = isRetryable): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      const delay = RETRY_DELAYS_MS[attempt - 1];
      if (delay === undefined || !retryable(err)) throw err;
      console.warn(`PayPal ${label} failed (attempt ${attempt}): ${err instanceof Error ? err.message : err}. Retrying in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
}

// fetch with the PayPal timeout; network failures become PayPalError(0).
async function send(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(PAYPAL_TIMEOUT_MS) });
  } catch (err) {
    const code = String((err as { cause?: { code?: string } })?.cause?.code ?? "");
    const reason = err instanceof Error && err.name === "TimeoutError" ? `timed out after ${PAYPAL_TIMEOUT_MS / 1000}s` : `${(err as Error)?.message ?? String(err)}${code ? ` (${code})` : ""}`;
    const failure = new PayPalError(0, `Network error: ${reason}`);
    failure.notSent = NOT_SENT_CODES.has(code);
    throw failure;
  }
}

async function oauth(body: string): Promise<{ status: number; data: { access_token?: string; expires_in?: number }; text: string }> {
  const res = await send(`${config.paypal.base}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basicAuth()}`, "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const text = await res.text();
  let data = {};
  try {
    data = JSON.parse(text);
  } catch {
    // keep empty object; status carries the failure
  }
  if (!res.ok && (res.status === 429 || res.status >= 500)) throw new PayPalError(res.status, `OAuth failed: ${text.slice(0, 200)}`);
  return { status: res.status, data, text };
}

export async function accessToken(): Promise<string> {
  if (cached && cached.expires > Date.now() + 60_000) return cached.token;
  const { status, data, text } = await withRetry("oauth", () => oauth("grant_type=client_credentials"));
  if (status !== 200 || !data.access_token) throw new PayPalError(status, `OAuth failed: ${text.slice(0, 200)}`);
  cached = { token: data.access_token, expires: Date.now() + (data.expires_in ?? 3000) * 1000 };
  return data.access_token;
}

// Browser-safe token for the JS SDK v6 (scoped to SDK initialisation).
export async function sdkClientToken(): Promise<string> {
  const started = performance.now();
  const { status, data } = await withRetry("client token", () => oauth("grant_type=client_credentials&response_type=client_token&intent=sdk_init"));
  record({ origin: "rest", method: "POST", path: "/v1/oauth2/token (client_token)", status, ms: elapsed(started) });
  if (status !== 200 || !data.access_token) throw new PayPalError(status, "Could not mint JS SDK v6 client token");
  return data.access_token;
}

interface RestOptions {
  mcpTool?: string;
  headers?: Record<string, string>;
  raw?: boolean;
  form?: FormData;
  // false for POSTs that PayPal cannot deduplicate; the caller decides how to retry.
  retry?: boolean;
}

export async function rest<T = any>(method: string, path: string, body?: unknown, opts: RestOptions = {}): Promise<{ status: number; data: T }> {
  const requestId = method === "GET" ? undefined : randomUUID();
  const attempt = async (n: number) => {
    const started = performance.now();
    const token = await accessToken();
    const headers: Record<string, string> = {
      Authorization: `Bearer ${token}`,
      Prefer: "return=representation",
      ...(requestId ? { "PayPal-Request-Id": requestId } : {}),
      ...opts.headers,
    };
    if (!opts.form) headers["Content-Type"] = "application/json";
    const label = n > 1 ? `${path} (retry ${n - 1})` : path;
    let res: Response;
    try {
      res = await send(`${config.paypal.base}${path}`, { method, headers, body: opts.form ?? (body === undefined ? undefined : JSON.stringify(body)) });
    } catch (err) {
      record({ origin: "rest", mcpTool: opts.mcpTool, method, path: label, status: 0, ms: elapsed(started), request: scrub(body), error: (err as Error).message });
      throw err;
    }
    const text = await res.text();
    let data: any = text;
    if (!opts.raw) {
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = text;
      }
    }
    record({
      origin: "rest",
      mcpTool: opts.mcpTool,
      method,
      path: label,
      status: res.status,
      ms: elapsed(started),
      request: scrub(body),
      response: scrub(opts.raw ? `[${text.length} bytes]` : data),
      error: res.ok ? undefined : summarize(data),
    });
    if (!res.ok) throw new PayPalError(res.status, summarize(data), data);
    return { status: res.status, data: data as T };
  };
  // Non-idempotent calls still retry when the connection never opened.
  return withRetry(`${method} ${path}`, attempt, opts.retry === false ? neverSent : isRetryable);
}

function summarize(data: any): string {
  if (data && typeof data === "object") {
    const detail = Array.isArray(data.details) && data.details[0] ? ` (${data.details[0].issue ?? data.details[0].description})` : "";
    return `${data.name ?? data.error ?? "ERROR"}: ${data.message ?? data.error_description ?? ""}${detail}`;
  }
  return String(data).slice(0, 200);
}
