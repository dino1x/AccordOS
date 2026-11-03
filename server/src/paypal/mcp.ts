// Every PayPal operation in AccordOS is a Model Context Protocol tool call.
//
//   orchestrator -> MCP Client -> InMemoryTransport -> McpServer -> gateway -> APIMatic SDK / PayPal REST
//
// Official tools are served with the exact names, descriptions and JSON input
// schemas published by @paypal/agent-toolkit (read at boot by listing the
// toolkit's own McpServer over a second in-memory transport). Operations the
// toolkit does not cover (AUTHORIZE holds, payouts, recorded payments, dispute
// evidence) are exposed as clearly prefixed `accordos_*` extension tools.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { CallToolRequestSchema, ListToolsRequestSchema, type CallToolResult, type JSONRPCMessage, type Tool } from "@modelcontextprotocol/sdk/types.js";
import { PayPalAgentToolkit } from "@paypal/agent-toolkit/mcp";
import { record, scrub } from "../telemetry.js";
import * as gw from "./gateway.js";

type Handler = (args: any) => Promise<unknown>;

// Official toolkit tools that AccordOS implements on top of its own gateway.
const OFFICIAL: Record<string, Handler> = {
  create_invoice: (a) => gw.createInvoice(a),
  send_invoice: (a) => gw.sendInvoice(a.invoice_id, a.note),
  get_invoice: (a) => gw.getInvoice(a.invoice_id),
  generate_invoice_qr_code: (a) => gw.invoiceQr(a.invoice_id, a.width ?? 320, a.height ?? 320),
  send_invoice_reminder: (a) => gw.remindInvoice(a.invoice_id, a.note ?? "", a.subject),
  create_order: (a) => {
    const items: { name: string; description?: string; itemTotal: number }[] = a.items ?? [];
    const amount = items.reduce((s, i) => s + Number(i.itemTotal), 0) + Number(a.shippingCost ?? 0) - Number(a.discount ?? 0);
    return gw.createOrder("CAPTURE", Math.round(amount * 100) / 100, items[0]?.description ?? "order", items.map((i) => i.name).join(", "));
  },
  get_order: (a) => gw.getOrder(a.id),
  pay_order: (a) => gw.captureOrder(a.id),
  create_shipment_tracking: (a) => gw.addTracking(a.order_id, a.transaction_id, a.carrier ?? "OTHER", a.tracking_number),
  get_shipment_tracking: async (a) => ({ trackers: (await gw.getOrder(a.order_id)).trackers }),
  list_disputes: async () => ({ items: await gw.listOpenDisputes() }),
  get_dispute: (a) => gw.getDispute(a.dispute_id),
  accept_dispute_claim: (a) => gw.acceptDisputeClaim(a.dispute_id, a.note ?? ""),
};

const obj = (properties: Record<string, object>, required: string[]): Tool["inputSchema"] => ({ type: "object", properties, required, additionalProperties: false });
const str = (description: string) => ({ type: "string", description });
const num = (description: string) => ({ type: "number", description });

const EXTENSIONS: { tool: Tool; handler: Handler; moves: boolean }[] = [
  {
    tool: { name: "accordos_create_authorize_order", description: "Create a PayPal Orders v2 order with intent AUTHORIZE to hold funds for a vendor award.", inputSchema: obj({ amount: num("Amount in USD."), reference_id: str("Purchase unit reference."), description: str("Purchase unit description.") }, ["amount", "reference_id", "description"]) },
    handler: (a) => gw.createOrder("AUTHORIZE", a.amount, a.reference_id, a.description),
    moves: true,
  },
  {
    tool: { name: "accordos_authorize_order", description: "Authorize an approved Orders v2 order and return the authorization id.", inputSchema: obj({ order_id: str("Approved order id.") }, ["order_id"]) },
    handler: (a) => gw.authorizeOrder(a.order_id),
    moves: true,
  },
  {
    tool: { name: "accordos_capture_authorization", description: "Capture an authorized payment (Payments v2).", inputSchema: obj({ authorization_id: str("Authorization id."), amount: num("Amount to capture in USD.") }, ["authorization_id", "amount"]) },
    handler: (a) => gw.captureAuthorization(a.authorization_id, a.amount),
    moves: true,
  },
  {
    tool: { name: "accordos_void_authorization", description: "Void an authorized payment and release the hold (Payments v2).", inputSchema: obj({ authorization_id: str("Authorization id.") }, ["authorization_id"]) },
    handler: (a) => gw.voidAuthorization(a.authorization_id),
    moves: true,
  },
  {
    tool: { name: "accordos_record_invoice_payment", description: "Record a payment against a sent invoice (Invoicing v2).", inputSchema: obj({ invoice_id: str("Invoice id."), amount: num("Amount paid in USD.") }, ["invoice_id", "amount"]) },
    handler: (a) => gw.recordInvoicePayment(a.invoice_id, a.amount),
    moves: true,
  },
  {
    tool: {
      name: "accordos_create_payout",
      description: "Send a Payouts v1 batch. Only callable in-process, after the AccordOS payment firewall has cleared every item.",
      inputSchema: obj({ items: { type: "array", items: obj({ receiver: str("Receiver email."), amount: num("Amount in USD."), note: str("Item note.") }, ["receiver", "amount", "note"]) } }, ["items"]),
    },
    handler: (a) => gw.createPayouts(a.items),
    moves: true,
  },
  {
    tool: { name: "accordos_provide_dispute_evidence", description: "Submit proof-of-fulfillment evidence for a dispute (Disputes v1).", inputSchema: obj({ dispute_id: str("Dispute id."), carrier: str("Carrier."), tracking_number: str("Tracking number."), notes: str("Seller statement.") }, ["dispute_id", "carrier", "tracking_number", "notes"]) },
    handler: (a) => gw.provideDisputeEvidence(a.dispute_id, a.carrier, a.tracking_number, a.notes),
    moves: true,
  },
];

// Tools that change PayPal state. External callers of /api/mcp/call cannot
// reach these unless MCP_ALLOW_EXTERNAL_WRITES=true.
const READ_ONLY = new Set(["get_invoice", "get_order", "get_shipment_tracking", "list_disputes", "get_dispute"]);
const INTERNAL_ONLY = new Set(["accordos_create_payout"]);

// Reads the official tool definitions from the PayPal Agent Toolkit's own MCP server.
async function officialDefinitions(): Promise<Map<string, Tool>> {
  const toolkit = new PayPalAgentToolkit({
    accessToken: "schema-discovery-only",
    configuration: {
      actions: {
        invoices: { create: true, list: true, get: true, send: true, sendReminder: true, cancel: true, generateQRC: true },
        orders: { create: true, get: true, capture: true },
        disputes: { list: true, get: true, create: true },
        shipment: { create: true, get: true },
      },
      context: { sandbox: true },
    },
  });
  const [a, b] = InMemoryTransport.createLinkedPair();
  const probe = new Client({ name: "accordos-schema-probe", version: "1.0.0" });
  await Promise.all([toolkit.connect(a), probe.connect(b)]);
  const { tools } = await probe.listTools();
  await probe.close();
  return new Map(tools.map((t) => [t.name, t as Tool]));
}

function missingRequired(tool: Tool, args: Record<string, unknown>): string[] {
  return ((tool.inputSchema.required as string[] | undefined) ?? []).filter((k) => args[k] === undefined || args[k] === null || args[k] === "");
}

// Records each JSON-RPC request/response pair crossing the client transport.
function instrument(transport: Transport): Transport {
  const pending = new Map<string | number, { method: string; params: any; started: number }>();
  const send = transport.send.bind(transport);
  transport.send = async (message: JSONRPCMessage, options) => {
    if ("method" in message && "id" in message) pending.set(message.id, { method: message.method, params: (message as any).params, started: performance.now() });
    return send(message, options);
  };
  const wrapIncoming = () => {
    const inner = transport.onmessage;
    transport.onmessage = (message: JSONRPCMessage, extra) => {
      const id = "id" in message ? message.id : undefined;
      if (id !== undefined && pending.has(id)) {
        const req = pending.get(id)!;
        pending.delete(id);
        if (req.method === "tools/call" || req.method === "tools/list") {
          const error = "error" in message ? message.error : undefined;
          const result = "result" in message ? (message.result as CallToolResult) : undefined;
          const toolError = result?.isError ? String((result.content?.[0] as any)?.text ?? "tool error") : undefined;
          record({
            origin: "mcp",
            mcpTool: req.method === "tools/call" ? req.params?.name : undefined,
            method: "JSON-RPC",
            path: req.method === "tools/call" ? `tools/call ${req.params?.name}` : `tools/list (${(result as any)?.tools?.length ?? 0} tools)`,
            status: error ? error.code : toolError ? 500 : 200,
            ms: Math.round((performance.now() - req.started) * 10) / 10,
            request: scrub({ jsonrpc: "2.0", id, method: req.method, params: req.method === "tools/call" ? req.params : {} }),
            response: req.method === "tools/call" ? scrub(error ?? result?.structuredContent ?? result) : undefined,
            error: error?.message ?? toolError,
          });
        }
      }
      inner?.(message, extra);
    };
  };
  return Object.assign(transport, { _wrapIncoming: wrapIncoming });
}

let connected: Promise<Client> | null = null;

async function connect(): Promise<Client> {
  const official = await officialDefinitions();
  const tools = new Map<string, { tool: Tool; handler: Handler; moves: boolean }>();
  for (const [name, handler] of Object.entries(OFFICIAL)) {
    const def = official.get(name);
    if (def) tools.set(name, { tool: { ...def, _meta: { source: "@paypal/agent-toolkit" } }, handler, moves: !READ_ONLY.has(name) });
  }
  for (const ext of EXTENSIONS) tools.set(ext.tool.name, { ...ext, tool: { ...ext.tool, _meta: { source: "accordos-extension" } } });

  const server = new McpServer({ name: "accordos-paypal", version: "1.0.0" }, { capabilities: { tools: {} } });
  server.server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [...tools.values()].map((t) => t.tool) }));
  server.server.setRequestHandler(CallToolRequestSchema, async (req): Promise<CallToolResult> => {
    const entry = tools.get(req.params.name);
    if (!entry) return { isError: true, content: [{ type: "text", text: `Unknown tool ${req.params.name}` }] };
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;
    const missing = missingRequired(entry.tool, args);
    if (missing.length) return { isError: true, content: [{ type: "text", text: `Missing required arguments: ${missing.join(", ")}` }] };
    try {
      const result = (await entry.handler(args)) as Record<string, unknown>;
      return { content: [{ type: "text", text: JSON.stringify(result) }], structuredContent: result };
    } catch (err) {
      const status = (err as { status?: number }).status;
      return { isError: true, content: [{ type: "text", text: JSON.stringify({ message: err instanceof Error ? err.message : String(err), status }) }] };
    }
  });
  toolMeta = new Map([...tools].map(([k, v]) => [k, { moves: v.moves }]));

  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const instrumented = instrument(clientSide) as Transport & { _wrapIncoming: () => void };
  const client = new Client({ name: "accordos-orchestrator", version: "1.0.0" });
  await server.connect(serverSide);
  await client.connect(instrumented);
  instrumented._wrapIncoming();
  await client.listTools();
  return client;
}

let toolMeta = new Map<string, { moves: boolean }>();

export function mcpClient(): Promise<Client> {
  connected ??= connect().catch((err) => {
    connected = null;
    throw err;
  });
  return connected;
}

export class McpToolError extends Error {
  constructor(public tool: string, message: string, public status?: number) {
    super(message);
  }
}

// Calls one tool over MCP and returns its structured result.
export async function callTool<T = any>(name: string, args: Record<string, unknown>): Promise<T> {
  const client = await mcpClient();
  const res = (await client.callTool({ name, arguments: args })) as CallToolResult;
  if (res.isError) {
    const text = String((res.content?.[0] as { text?: string } | undefined)?.text ?? "Tool error");
    let parsed: { message?: string; status?: number } = {};
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { message: text };
    }
    throw new McpToolError(name, `${name}: ${parsed.message ?? text}`, parsed.status);
  }
  return res.structuredContent as T;
}

export async function listTools(): Promise<Tool[]> {
  const client = await mcpClient();
  return (await client.listTools()).tools;
}

// Policy for calls arriving over HTTP from outside the process.
export function externalCallAllowed(name: string, mode: "live" | "replay"): string | null {
  if (INTERNAL_ONLY.has(name)) return `${name} is internal only: payouts must pass the AccordOS firewall`;
  const meta = toolMeta.get(name);
  if (!meta) return null;
  if (meta.moves && mode === "live" && process.env.MCP_ALLOW_EXTERNAL_WRITES !== "true") return `${name} changes PayPal state; external writes are disabled in live mode`;
  return null;
}
