// End-to-end smoke test of the whole desk in whatever mode the env selects.
// Run with: npm test
import "./env.js";
import assert from "node:assert/strict";
import * as o from "./orchestrator.js";
import { state } from "./state.js";
import { listTelemetry } from "./telemetry.js";
import { callTool, externalCallAllowed, listTools } from "./paypal/mcp.js";
import { isRetryable, PayPalError, withRetry } from "./paypal/rest.js";

const step = async (name: string, fn: () => unknown) => {
  const t = performance.now();
  await fn();
  console.log(`ok  ${name.padEnd(42)} ${(performance.now() - t).toFixed(1)}ms`);
};

await step("seed scenario", () => o.seed());
assert.ok(state.brief && state.allocation?.feasible, "allocation feasible");
assert.equal(Math.round(state.brief.milestones.reduce((s, m) => s + m.pct, 0)), 100);
assert.ok(state.allocation!.total <= state.brief.budget, "allocation within budget");
assert.equal(state.tranches[0].status, "paid");
assert.ok(state.auctions.length >= 3, "auctions ran");

const before = state.tasks.find((t) => t.id === "commission")!.start;
await step("pay milestone 2 tranche", () => o.payTranche(state.tranches[1].id));
assert.ok(state.tasks.find((t) => t.id === "commission")!.start <= before, "paying T2 never pushes commissioning out");

assert.ok(state.holds.length >= 2, "seed placed holds");
assert.ok(state.holds.some((h) => h.status === "captured"), "seed captured a hold so disputes and payouts are clickable");
assert.ok(state.widgets.length >= 1, "seed spawned a widget");
for (const h of state.holds.filter((x) => x.status === "created")) await step(`authorize ${h.id}`, () => o.authorizeHold(h.id));
assert.ok(state.tasks.find((t) => t.id === "holds")!.gate!.satisfied);
await step("capture all holds + tracking", () => o.captureAllHolds());
assert.ok(state.holds.every((h) => h.status === "captured" && h.tracking));

const installStart = () => state.tasks.find((t) => t.id === "furniture")!.start;
const startBefore = installStart();
await step("carrier delay 4 days", () => o.delayShipment(4));
assert.equal(installStart(), startBefore + 4, "delay propagates to downstream install");
assert.ok(state.events[0].diff.length > 0, "reflow event records moved tasks");

await step("open dispute", () => o.openDispute());
await step("defend dispute", () => o.defendDispute(state.disputes[0].id));
assert.ok(state.disputes[0].dossier && state.disputes[0].dossier.evidence.length >= 4);
await step("resolve dispute", () => o.resolveDispute(state.disputes[0].id));

await step("issue + pay handover tranche", async () => {
  await o.issueTranche(state.tranches[2].id);
  await o.payTranche(state.tranches[2].id);
});
await step("payouts (firewall gated)", () => o.runPayouts());
assert.ok(state.payouts.length === 1 && state.payouts[0].items.length >= state.holds.length);

const rt = o.redTeam();
const control = rt.verdicts.find((v) => v.attackId === "control")!;
assert.equal(control.blocked, false, "control payment must pass");
const attacks = rt.verdicts.filter((v) => v.attackId !== "control");
assert.ok(attacks.every((v) => v.blocked), `all attacks blocked: ${attacks.filter((v) => !v.blocked).map((v) => v.attackId)}`);
assert.ok(attacks.every((v) => v.micros < 5000 && v.paypalCalls === 0));
console.log(`ok  red-team: ${attacks.length}/${attacks.length} blocked, max ${Math.max(...attacks.map((v) => v.micros))}us, 0 PayPal calls`);

await step("widget spawn", () => o.addWidget("What happens to margin if costs rise 6% and the dollar drops 3%?"));
assert.equal(state.widgets[0].kind, "margin");

const tools = await listTools();
const official = tools.filter((t) => (t._meta as { source?: string } | undefined)?.source === "@paypal/agent-toolkit");
assert.ok(official.length >= 12, `official toolkit tools served over MCP (${official.length})`);
assert.ok((official.find((t) => t.name === "create_invoice")!.inputSchema.properties as object)["invoicer_business_name" as keyof object], "create_invoice uses the toolkit schema");
const frames = listTelemetry().filter((t) => t.origin === "mcp" && t.path.startsWith("tools/call"));
const paypalHttp = listTelemetry().filter((t) => ["replay", "apimatic-sdk", "rest"].includes(t.origin) && !t.path.includes("oauth2"));
const succeededHttp = paypalHttp.filter((t) => t.status < 400);
assert.ok(paypalHttp.every((t) => Boolean(t.mcpTool)) && frames.length >= succeededHttp.length, `every PayPal call went through MCP (${frames.length} frames, ${succeededHttp.length} succeeded calls)`);
await assert.rejects(() => callTool("create_invoice", { currency_code: "USD" }), /Missing required arguments|items/, "schema validation over MCP");
assert.ok(externalCallAllowed("accordos_create_payout", "replay"), "payouts are internal only");
console.log(`ok  MCP: ${tools.length} tools (${official.length} from @paypal/agent-toolkit), ${frames.length} tools/call frames`);

let retryAttempts = 0;
const retryResult = await withRetry("selftest-retry", async (attempt) => {
  retryAttempts = attempt;
  if (attempt === 1) throw new PayPalError(0, "Network error: simulated drop");
  if (attempt === 2) throw new PayPalError(503, "Service Unavailable");
  return "recovered";
});
assert.equal(retryResult, "recovered");
assert.equal(retryAttempts, 3, "withRetry recovers after network drop (0) and 503");
let nonRetryAttempts = 0;
await assert.rejects(
  () =>
    withRetry("selftest-422", async (attempt) => {
      nonRetryAttempts = attempt;
      throw new PayPalError(422, "ORDER_NOT_APPROVED");
    }),
  /ORDER_NOT_APPROVED/,
);
assert.equal(nonRetryAttempts, 1, "withRetry does not retry 422 business errors");
assert.equal(isRetryable(new PayPalError(429, "Rate limit")), true);
assert.equal(isRetryable(new PayPalError(400, "Bad request")), false);
console.log("ok  PayPal retry engine: recovers on status 0/503, skips 4xx business errors");

console.log(`\n${listTelemetry().length} API calls recorded, mode=${state.mode}. All checks passed.`);
