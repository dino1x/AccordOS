import { Router, type Request, type Response } from "express";
import { config, paypalMode } from "./config.js";
import * as o from "./orchestrator.js";
import { PayPalError, sdkClientToken } from "./paypal/rest.js";
import { verifyWebhook } from "./paypal/gateway.js";
import { callTool, externalCallAllowed, listTools, McpToolError } from "./paypal/mcp.js";
import { runStudioTurn, StudioTurnUnavailable } from "./engine/studioTurn.js";
import { state } from "./state.js";
import { bus, listTelemetry } from "./telemetry.js";

export const api = Router();

type Handler = (req: Request) => unknown | Promise<unknown>;

function route(handler: Handler) {
  return async (req: Request, res: Response) => {
    try {
      if (!state.ready && req.path !== "/reset") {
        await o.ensureSeeded();
      }
      res.json(await handler(req));
    } catch (err) {
      const status = err instanceof o.ActionError ? err.status : err instanceof PayPalError ? 502 : 500;
      const message = err instanceof Error ? err.message : String(err);
      const upstream = err instanceof PayPalError ? { paypalStatus: err.status } : {};
      if (status >= 500) console.error(req.method, req.path, message);
      res.status(status).json({ error: message, endpoint: `${req.method} ${req.originalUrl}`, ...upstream });
    }
  };
}

api.get("/health", (_req, res) => res.json({ ok: true, mode: paypalMode, version: state.version }));
api.get("/state", route(() => state));
api.get("/telemetry", route(() => listTelemetry()));
api.get("/config", route(() => ({ mode: paypalMode, clientId: paypalMode === "live" ? config.paypal.clientId : null })));

// Server-sent events: the UI re-renders on every committed state change.
api.get("/stream", (req, res) => {
  res.set({ "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" });
  res.flushHeaders();
  const send = (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  const onState = (s: unknown) => send("state", s);
  const onTelemetry = (t: unknown) => send("telemetry", t);
  bus.on("state", onState);
  bus.on("telemetry", onTelemetry);
  const ping = setInterval(() => res.write(": ping\n\n"), 20000);
  req.on("close", () => {
    clearInterval(ping);
    bus.off("state", onState);
    bus.off("telemetry", onTelemetry);
  });
});

api.post("/reset", route(() => o.seed()));
api.post("/brief", route((req) => {
  const text = String(req.body?.text ?? "").trim();
  if (text.length < 40) throw new o.ActionError(400, "Brief is too short to plan from (40 characters minimum)");
  return o.ingestBrief(text);
}));

api.post("/tranches/:id/issue", route((req) => o.issueTranche(String(req.params.id))));
api.post("/tranches/:id/remind", route((req) => o.remindTranche(String(req.params.id))));
api.post("/tranches/:id/pay", route((req) => o.payTranche(String(req.params.id))));
api.post("/tranches/:id/checkout", route((req) => o.trancheCheckoutOrder(String(req.params.id))));
api.post("/tranches/:id/checkout/:orderId/capture", route((req) => o.trancheCheckoutCapture(String(req.params.id), String(req.params.orderId))));

api.post("/bakeoff", route(() => o.runBakeOff()));
api.post("/auctions/:id/hold", route((req) => o.placeHold(String(req.params.id))));
api.post("/holds/place-all", route(() => o.placeAllHolds()));
api.post("/holds/capture-all", route(() => o.captureAllHolds()));
api.post("/holds/:id/authorize", route((req) => o.authorizeHold(String(req.params.id))));
api.post("/holds/:id/capture", route((req) => o.captureHold(String(req.params.id))));
api.post("/holds/:id/void", route((req) => o.voidHold(String(req.params.id))));

api.post("/schedule/delay", route((req) => o.delayShipment(Math.max(1, Math.min(30, Number(req.body?.days ?? 3))))));
api.post("/disputes", route((req) => o.openDispute(req.body?.holdId)));
api.post("/disputes/:id/defend", route((req) => o.defendDispute(String(req.params.id))));
api.post("/disputes/:id/resolve", route((req) => o.resolveDispute(String(req.params.id))));
api.post("/payouts", route(() => o.runPayouts()));

api.get("/redteam/attacks", route(() => o.attacks()));
api.post("/redteam/run", route((req) => o.redTeam(Array.isArray(req.body?.ids) ? req.body.ids : undefined)));

api.post("/widgets", route((req) => {
  const prompt = String(req.body?.prompt ?? "").trim();
  if (!prompt) throw new o.ActionError(400, "Ask a question to build a widget");
  return o.addWidget(prompt.slice(0, 300));
}));
api.delete("/widgets/:id", route((req) => o.removeWidget(String(req.params.id))));

// MCP over HTTP: list the PayPal tool catalog and call tools as JSON-RPC.
api.get("/mcp/tools", route(async () => ({ server: "accordos-paypal", tools: await listTools() })));
api.post("/mcp/call", async (req, res) => {
  const body = req.body ?? {};
  const rpc = body.jsonrpc === "2.0";
  const id = rpc ? body.id ?? null : null;
  const method = rpc ? body.method : "tools/call";
  const params = rpc ? body.params ?? {} : { name: body.name, arguments: body.arguments ?? {} };
  const reply = (status: number, payload: object) => res.status(rpc ? 200 : status).json(rpc ? { jsonrpc: "2.0", id, ...payload } : payload);
  try {
    if (method === "tools/list") return reply(200, { result: { tools: await listTools() } });
    if (method !== "tools/call") return reply(400, { error: { code: -32601, message: `Method not found: ${method}` } });
    const name = String(params.name ?? "");
    const denied = externalCallAllowed(name, paypalMode);
    if (denied) return reply(403, { error: { code: -32001, message: denied } });
    const result = await callTool(name, params.arguments ?? {});
    return reply(200, { result: { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result } });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return reply(err instanceof McpToolError ? 422 : 500, { error: { code: -32000, message } });
  }
});

// AG Studio's AI harness runs its agent turns on Claude through this endpoint.
// A per-IP budget keeps a public deployment from becoming an open Claude proxy.
const STUDIO_TURNS_PER_10_MIN = 60;
const studioBudget = new Map<string, { count: number; resetAt: number }>();
function studioTurnAllowed(ip: string): boolean {
  const now = Date.now();
  const entry = studioBudget.get(ip);
  if (!entry || entry.resetAt < now) {
    studioBudget.set(ip, { count: 1, resetAt: now + 10 * 60_000 });
    return true;
  }
  entry.count += 1;
  return entry.count <= STUDIO_TURNS_PER_10_MIN;
}

api.post("/studio/turn", async (req, res) => {
  if (!studioTurnAllowed(String(req.headers["x-forwarded-for"] ?? req.ip ?? "local").split(",")[0].trim())) {
    return res.status(429).json({ error: "AG Studio assistant rate limit reached; try again in a few minutes", endpoint: "POST /api/studio/turn" });
  }
  const request = req.body?.request;
  if (!request || !Array.isArray(request.input) || !request.responseFormat) {
    return res.status(400).json({ error: "Expected { request: AgLlmRequest, context }", endpoint: "POST /api/studio/turn" });
  }
  try {
    res.json(await runStudioTurn(request, String(req.body?.context ?? "")));
  } catch (err) {
    const status = err instanceof StudioTurnUnavailable ? 409 : 502;
    res.status(status).json({ error: err instanceof Error ? err.message : String(err), endpoint: "POST /api/studio/turn" });
  }
});

api.get("/paypal/client-token", route(async () => {
  if (paypalMode !== "live") throw new o.ActionError(409, "Replay mode: JS SDK v6 needs PayPal sandbox keys");
  return { clientToken: await sdkClientToken() };
}));

api.post("/webhooks/paypal", route(async (req) => {
  const ok = await verifyWebhook(req.headers as Record<string, string>, req.body);
  if (!ok) throw new o.ActionError(401, "Webhook signature verification failed");
  await o.handleWebhook(req.body);
  return { received: true };
}));
