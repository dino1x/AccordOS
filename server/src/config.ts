import type { Mode } from "./types.js";

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 8787),
  paypal: {
    clientId: env.PAYPAL_CLIENT_ID ?? "",
    clientSecret: env.PAYPAL_CLIENT_SECRET ?? "",
    buyerEmail: env.PAYPAL_SANDBOX_BUYER_EMAIL ?? "",
    webhookId: env.PAYPAL_WEBHOOK_ID ?? "",
    base: "https://api-m.sandbox.paypal.com",
  },
  anthropicKey: env.ANTHROPIC_API_KEY ?? "",
  channel3: {
    key: env.CHANNEL3_API_KEY ?? "",
    base: env.CHANNEL3_BASE_URL ?? "https://api.trychannel3.com",
  },
};

export const paypalMode: Mode = config.paypal.clientId && config.paypal.clientSecret ? "live" : "replay";
export const aiMode = config.anthropicKey ? "claude" : "deterministic";
export const catalogMode = config.channel3.key ? "channel3" : "fixture";
