// Claude is used where language has to become structure: reading a client
// brief, interpreting a finance prompt, and writing a dispute narrative. Every
// call has a deterministic fallback so the desk works without a key, and no
// model output is ever allowed to move money on its own.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { config } from "../config.js";
import { record } from "../telemetry.js";

// Override with ANTHROPIC_MODEL when the key's account has access to a different model.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const client = config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null;

export const BriefSchema = z.object({
  title: z.string(),
  clientName: z.string(),
  clientEmail: z.string(),
  budget: z.number(),
  startDate: z.string(),
  milestones: z.array(z.object({ name: z.string(), pct: z.number(), dueDay: z.number(), deliverable: z.string() })),
  lineItems: z.array(z.object({ query: z.string(), qty: z.number(), category: z.string(), maxUnit: z.number() })),
  earlyPayDiscountPct: z.number(),
  earlyPayDays: z.number(),
  netDays: z.number(),
});
export type ParsedBrief = z.infer<typeof BriefSchema>;

export const WidgetIntentSchema = z.object({
  kind: z.enum(["anomaly", "margin", "nudge"]),
  title: z.string(),
  fxShiftPct: z.number(),
  costShiftPct: z.number(),
  zThreshold: z.number(),
  minDaysOverdue: z.number(),
});
export type WidgetIntent = z.infer<typeof WidgetIntentSchema>;

const responseCache = new Map<string, unknown>();

async function structured<T>(name: string, schema: z.ZodType<T>, system: string, user: string): Promise<T | null> {
  if (!client) return null;
  const cacheKey = `${MODEL}:${name}:${user.trim()}`;
  const hit = responseCache.get(cacheKey) as T | undefined;
  if (hit) {
    record({ origin: "claude", method: "POST", path: `/v1/messages (${name}, cached)`, status: 200, ms: 1, response: hit });
    return hit;
  }
  const started = performance.now();
  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 1800,
      output_config: { effort: "low", format: zodOutputFormat(schema) },
      system,
      messages: [{ role: "user", content: user }],
    });
    const ms = Math.round(performance.now() - started);
    if (response.stop_reason === "refusal" || !response.parsed_output) {
      record({ origin: "claude", method: "POST", path: `/v1/messages (${name})`, status: 200, ms, error: `No parsed output (stop_reason ${response.stop_reason})` });
      return null;
    }
    responseCache.set(cacheKey, response.parsed_output);
    record({ origin: "claude", method: "POST", path: `/v1/messages (${name})`, status: 200, ms, response: response.parsed_output });
    return response.parsed_output as T;
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 0 : 0;
    record({ origin: "claude", method: "POST", path: `/v1/messages (${name})`, status, ms: Math.round(performance.now() - started), error: err instanceof Error ? err.message : String(err) });
    return null;
  }
}

export function aiParseBrief(text: string, today: string): Promise<ParsedBrief | null> {
  return structured(
    "parse_brief",
    BriefSchema,
    `You turn a client project brief into a commercial execution plan. Today is ${today}. ` +
      "Milestone pct values are percentages of the total budget and must sum to 100. dueDay is days after start. " +
      "lineItems are physical goods to procure, each with a short product search query, quantity, a category " +
      "(furniture, network, compute, av, power or other) and a maximum unit price in USD. " +
      "If the brief omits early-payment terms, use 2 percent within 10 days and net 30. Use an empty string for unknown emails.",
    text,
  );
}

export function aiWidgetIntent(prompt: string): Promise<WidgetIntent | null> {
  return structured(
    "widget_intent",
    WidgetIntentSchema,
    "Map an operator's finance question to one dashboard widget. kind is anomaly (unusual ledger amounts or payees), " +
      "margin (what currency or cost moves do to project margin) or nudge (who owes money and should be reminded). " +
      "Extract numeric parameters from the question; use 0 for fxShiftPct and costShiftPct, 2 for zThreshold and 0 for minDaysOverdue when not stated. " +
      "title is a short widget title in title case.",
    prompt,
  );
}

const DossierSchema = z.object({ summary: z.string() });

export async function aiDisputeSummary(facts: string): Promise<string | null> {
  const out = await structured(
    "dispute_dossier",
    DossierSchema,
    "You write the seller's statement for a PayPal dispute. Use only the facts given. Be specific, cite each evidence " +
      "reference in parentheses, keep it under 120 words, no marketing language.",
    facts,
  );
  return out?.summary ?? null;
}
