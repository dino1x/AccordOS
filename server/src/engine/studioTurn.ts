// Runs one AG Studio agent turn on Claude. AG Studio's harness speaks an
// OpenAI-Responses-style protocol (conversation items, function calls,
// AG-UI events); this module translates it to and from the Anthropic
// Messages API so Studio's own agents (orchestrator, widget builder, ...)
// run on Claude with Studio's own tools.
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { record, scrub } from "../telemetry.js";

// Minimal mirrors of the ag-studio wire types (the server does not depend on the browser package).
export interface StudioItem {
  type: "message" | "function_call" | "function_call_output" | "reasoning";
  role?: "user" | "system" | "assistant";
  content?: { type: string; text?: string }[];
  callId?: string;
  name?: string;
  arguments?: string;
  output?: string;
}
export interface StudioTool {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}
export interface StudioRequest {
  input: StudioItem[];
  instructions?: string;
  tools?: StudioTool[];
  toolChoice?: "auto" | "none" | "required" | { name: string };
  responseFormat: { type: "text" } | { type: "json"; name: string; description?: string; schema: Record<string, unknown> };
}
export type StudioEvent =
  | { type: "TEXT_MESSAGE_START"; messageId: string; role: "assistant" }
  | { type: "TEXT_MESSAGE_CONTENT"; messageId: string; delta: string }
  | { type: "TEXT_MESSAGE_END"; messageId: string }
  | { type: "TOOL_CALL_START"; toolCallId: string; toolCallName: string }
  | { type: "TOOL_CALL_ARGS"; toolCallId: string; delta: string }
  | { type: "TOOL_CALL_END"; toolCallId: string };
export interface StudioResponse {
  id: string;
  createdAt: number;
  status: "completed" | "failed" | "incomplete";
  model: string;
  error?: { code: string; message: string };
  output: (
    | { id: string; kind: "output"; type: "message"; role: "assistant"; status: "completed"; content: { type: "text"; text: string; annotations: [] }[] }
    | { id: string; kind: "output"; type: "function_call"; callId: string; name: string; arguments: string; status: "completed" }
  )[];
}

export const STUDIO_MODEL = () => process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

const itemText = (item: StudioItem) => (item.content ?? []).map((c) => c.text ?? "").join("\n").trim();

function parseArgs(raw: string | undefined): Record<string, unknown> {
  try {
    const v = JSON.parse(raw || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch {
    return {};
  }
}

// Studio conversation items -> Anthropic messages. Consecutive same-role
// content is merged, so every tool_result directly follows its tool_use.
export function toAnthropicMessages(input: StudioItem[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  const push = (role: "user" | "assistant", block: Anthropic.ContentBlockParam) => {
    const last = out[out.length - 1];
    if (last && last.role === role && Array.isArray(last.content)) (last.content as Anthropic.ContentBlockParam[]).push(block);
    else out.push({ role, content: [block] });
  };
  for (const item of input) {
    if (item.type === "message") {
      const text = itemText(item);
      if (!text) continue;
      if (item.role === "assistant") push("assistant", { type: "text", text });
      else push("user", { type: "text", text: item.role === "system" ? `[Studio context] ${text}` : text });
    } else if (item.type === "function_call" && item.callId && item.name) {
      push("assistant", { type: "tool_use", id: item.callId, name: item.name, input: parseArgs(item.arguments) });
    } else if (item.type === "function_call_output" && item.callId) {
      push("user", { type: "tool_result", tool_use_id: item.callId, content: item.output ?? "" });
    }
  }
  if (!out.length || out[0].role !== "user") out.unshift({ role: "user", content: [{ type: "text", text: "Continue." }] });
  return out;
}

export function toAnthropicTools(tools: StudioTool[] | undefined): Anthropic.Tool[] {
  return (tools ?? []).map((t) => {
    const { $schema: _ignored, ...schema } = t.parameters as Record<string, unknown>;
    return {
      name: t.name,
      description: t.description.slice(0, 4000),
      input_schema: { ...schema, type: "object" } as Anthropic.Tool.InputSchema,
    };
  });
}

export function toAnthropicToolChoice(choice: StudioRequest["toolChoice"]): Anthropic.ToolChoice | undefined {
  if (!choice || choice === "auto") return { type: "auto" };
  if (choice === "none") return { type: "none" };
  if (choice === "required") return { type: "any" };
  return { type: "tool", name: choice.name };
}

// Anthropic message -> Studio response plus the AG-UI events the browser streams.
export function fromAnthropicMessage(msg: Pick<Anthropic.Message, "id" | "content" | "stop_reason" | "model">, jsonTurn: boolean): { response: StudioResponse; events: StudioEvent[] } {
  const output: StudioResponse["output"] = [];
  const events: StudioEvent[] = [];
  const texts = msg.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text);
  let text = texts.join("\n\n").trim();
  if (jsonTurn) text = extractJson(text);
  if (text) {
    output.push({ id: msg.id, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text, annotations: [] }] });
    events.push({ type: "TEXT_MESSAGE_START", messageId: msg.id, role: "assistant" });
    for (const delta of text.match(/[\s\S]{1,64}/g) ?? []) events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: msg.id, delta });
    events.push({ type: "TEXT_MESSAGE_END", messageId: msg.id });
  }
  for (const block of msg.content) {
    if (block.type !== "tool_use") continue;
    const args = JSON.stringify(block.input ?? {});
    output.push({ id: block.id, kind: "output", type: "function_call", callId: block.id, name: block.name, arguments: args, status: "completed" });
    events.push({ type: "TOOL_CALL_START", toolCallId: block.id, toolCallName: block.name }, { type: "TOOL_CALL_ARGS", toolCallId: block.id, delta: args }, { type: "TOOL_CALL_END", toolCallId: block.id });
  }
  const refused = msg.stop_reason === "refusal";
  return {
    response: {
      id: msg.id,
      createdAt: Date.now(),
      status: refused ? "failed" : msg.stop_reason === "max_tokens" ? "incomplete" : "completed",
      model: msg.model,
      ...(refused ? { error: { code: "refusal", message: "Claude declined this request" } } : {}),
      output,
    },
    events,
  };
}

// Pulls the JSON object out of a reply that may be wrapped in prose or a code fence.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = (fenced ? fenced[1] : text).trim();
  const start = candidate.search(/[[{]/);
  if (start < 0) return candidate;
  const opener = candidate[start];
  const end = candidate.lastIndexOf(opener === "{" ? "}" : "]");
  const slice = end > start ? candidate.slice(start, end + 1) : candidate;
  try {
    JSON.parse(slice);
    return slice;
  } catch {
    return candidate;
  }
}

const client = () => (config.anthropicKey ? new Anthropic({ apiKey: config.anthropicKey }) : null);

export class StudioTurnUnavailable extends Error {}

export async function runStudioTurn(req: StudioRequest, context: string): Promise<{ response: StudioResponse; events: StudioEvent[] }> {
  const anthropic = client();
  if (!anthropic) throw new StudioTurnUnavailable("No ANTHROPIC_API_KEY configured");
  const jsonTurn = req.responseFormat.type === "json";
  const system = [
    req.instructions ?? "",
    "## AccordOS project context\nThe dashboard reports on this live project. Use it for numbers and names; use Studio's tools to read or change the report.",
    context.slice(0, 6000),
    jsonTurn ? `\nRespond with a single JSON value that matches the schema for "${(req.responseFormat as { name: string }).name}". No prose, no code fence.` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  const base: Anthropic.MessageCreateParamsNonStreaming = {
    model: STUDIO_MODEL(),
    max_tokens: 2500,
    system,
    messages: toAnthropicMessages(req.input),
  };
  const tools = toAnthropicTools(req.tools);
  if (tools.length && !jsonTurn) {
    base.tools = tools;
    base.tool_choice = toAnthropicToolChoice(req.toolChoice);
  }

  const started = performance.now();
  const call = async (params: Anthropic.MessageCreateParamsNonStreaming) => anthropic.messages.create(params);
  let msg: Anthropic.Message;
  try {
    if (jsonTurn) {
      // Structured outputs when the schema is accepted; otherwise the prompt instruction plus extraction.
      try {
        msg = await call({ ...base, output_config: { format: { type: "json_schema", schema: (req.responseFormat as { schema: Record<string, unknown> }).schema } } });
      } catch (err) {
        if (!(err instanceof Anthropic.BadRequestError)) throw err;
        msg = await call(base);
      }
    } else {
      try {
        msg = await call(base);
      } catch (err) {
        // Some models reject forced tool choice; fall back to auto.
        if (!(err instanceof Anthropic.BadRequestError) || base.tool_choice?.type === "auto" || !base.tool_choice) throw err;
        msg = await call({ ...base, tool_choice: { type: "auto" } });
      }
    }
  } catch (err) {
    const status = err instanceof Anthropic.APIError ? err.status ?? 0 : 0;
    record({ origin: "claude", method: "POST", path: "/v1/messages (ag_studio)", status, ms: Math.round(performance.now() - started), error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
  const result = fromAnthropicMessage(msg, jsonTurn);
  record({
    origin: "claude",
    method: "POST",
    path: "/v1/messages (ag_studio)",
    status: 200,
    ms: Math.round(performance.now() - started),
    request: scrub({ tools: tools.map((t) => t.name), json: jsonTurn, lastInput: req.input.at(-1)?.type }),
    response: scrub(result.response.output.map((o) => (o.type === "function_call" ? { tool: o.name, arguments: o.arguments } : { text: o.content[0]?.text }))),
  });
  return result;
}
