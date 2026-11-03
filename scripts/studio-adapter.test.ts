// Checks the zero-key AG Studio adapter against a seeded AccordOS state.
// Run with: npm test
import assert from "node:assert/strict";
import { seed } from "../server/src/orchestrator.ts";
import { state } from "../server/src/state.ts";
import type { AgReportState } from "ag-studio";
import { answer, createLocalAdapter, createStudioAdapter, PROMPT_STARTERS, type StudioStateApi } from "../web/src/components/studioAi.ts";
import { extractJson, fromAnthropicMessage, toAnthropicMessages, toAnthropicToolChoice, toAnthropicTools } from "../server/src/engine/studioTurn.ts";
import { initialStudioReport } from "../web/src/components/studioReport.ts";

await seed();
// AG Studio zero-key adapter: first turn calls Studio tools, second turn answers from live state.
const adapter = createLocalAdapter(() => state);
const user = { id: "u1", kind: "input" as const, type: "message" as const, role: "user" as const, status: "completed" as const, content: [{ type: "text" as const, text: "Show holds by vendor" }] };
const tools = (names: string[]) => names.map((name) => ({ name, description: name, parameters: { type: "object" } }));
const turn1 = await adapter.executeTurn({ input: [user], tools: tools(["view_page", "rename_thread"]), responseFormat: { type: "text" } }).complete;
const calls = turn1.output.filter((o: { type: string }) => o.type === "function_call") as { name: string; callId: string }[];
assert.deepEqual(calls.map((c) => c.name), ["rename_thread", "view_page"], "adapter calls Studio tools first");
const turn2 = await adapter.executeTurn({
  input: [user, ...turn1.output, ...calls.map((c) => ({ type: "function_call_output" as const, callId: c.callId, output: JSON.stringify({ widgets: { a: {}, b: {} } }), status: "completed" as const }))],
  tools: tools(["view_page"]),
  responseFormat: { type: "text" },
}).complete;
const reply = (turn2.output[0] as { content: { text: string }[] }).content[0].text;
assert.match(reply, /\| Vendor \| Holds/, "holds-by-vendor table");
assert.match(reply, /2 widgets on the canvas/, "answer uses the view_page result");
assert.match(answer("Which tranches are unpaid?", state), /outstanding|Every tranche is paid/);
console.log("ok  AG Studio adapter: tool round trip and live-state answers");

// Adding a widget: the adapter writes a new full report state through the Studio API.
let report: AgReportState = initialStudioReport;
const writes: AgReportState[] = [];
const api: StudioStateApi = { getState: () => report, setState: (next) => { writes.push(next); report = next; } };
const withApi = createLocalAdapter(() => state, api);
const ask = async (text: string) => {
  const msg = { ...user, id: `u-${text}`, content: [{ type: "text" as const, text }] };
  const res = await withApi.executeTurn({ input: [msg], tools: [], responseFormat: { type: "text" } }).complete;
  return (res.output[0] as { content: { text: string }[] }).content[0].text;
};
assert.ok(PROMPT_STARTERS.some((p) => p.prompt === "Add a chart of payouts by receiver"), "payouts prompt starter offered");

const before = initialStudioReport.pages[0];
const added = await ask("Add a chart of payouts by receiver");
assert.equal(writes.length, 1, "one setState call");
const page = report.pages[0];
assert.notEqual(page, before, "page replaced immutably");
assert.equal(initialStudioReport.pages[0].widgets?.["payouts-by-receiver"], undefined, "initial report left untouched");
assert.equal(page.widgets?.["payouts-by-receiver"]?.type, "bar-chart-grouped");
assert.deepEqual(page.widgetLayout?.["payouts-by-receiver"], { xTrack: 0, yTrack: 37, xSpan: 24, ySpan: 14 }, "placed below the existing widgets");
assert.equal(Object.keys(page.widgets ?? {}).length, Object.keys(before.widgets ?? {}).length + 1, "existing widgets kept");
assert.match(added, /Added a bar chart of payouts by receiver to the canvas as `payouts-by-receiver`/);

await ask("Add a donut of holds by status");
assert.equal(report.pages[0].widgets?.["holds-by-status"]?.type, "donut-chart");
assert.equal(report.pages[0].widgetLayout?.["holds-by-status"]?.yTrack, 51, "stacked under the previous addition");

const again = await ask("Add a chart of payouts by receiver");
assert.match(again, /already on the canvas/);
assert.equal(writes.length, 2, "no duplicate write");
const unknown = await ask("Add a chart of crew overtime");
assert.match(unknown, /I can add/);
assert.equal(writes.length, 2, "unknown chart requests change nothing");
console.log("ok  AG Studio adapter: adds payouts-by-receiver and holds-by-status widgets via setState");



// Claude turn mapping: Studio items -> Anthropic messages, tools and choice.
{
  const msgs = toAnthropicMessages([
    { type: "message", role: "user", content: [{ type: "text", text: "Add a chart of payouts" }] },
    { type: "function_call", callId: "c1", name: "delegate_to", arguments: '{"type":{"id":"widget"},"instructions":"bar chart"}' },
    { type: "function_call_output", callId: "c1", output: "done" },
    { type: "reasoning" },
  ]);
  assert.deepEqual(msgs.map((m) => m.role), ["user", "assistant", "user"], "roles alternate");
  const toolUse = (msgs[1].content as { type: string; id?: string; input?: unknown }[])[0];
  assert.equal(toolUse.type, "tool_use");
  assert.equal(toolUse.id, "c1");
  assert.deepEqual(toolUse.input, { type: { id: "widget" }, instructions: "bar chart" });
  assert.equal((msgs[2].content as { type: string; tool_use_id?: string }[])[0].tool_use_id, "c1", "tool_result follows its tool_use");

  const tools = toAnthropicTools([{ name: "view_page", description: "View", parameters: { $schema: "http://json-schema.org/draft-07/schema#", type: "object", properties: {} } }]);
  assert.equal(tools[0].input_schema.type, "object");
  assert.equal("$schema" in tools[0].input_schema, false, "$schema stripped");
  assert.deepEqual(toAnthropicToolChoice("required"), { type: "any" });
  assert.deepEqual(toAnthropicToolChoice({ name: "view_page" }), { type: "tool", name: "view_page" });

  const mapped = fromAnthropicMessage(
    { id: "msg_1", model: "claude-sonnet-4-6", stop_reason: "tool_use", content: [{ type: "text", text: "Adding it.", citations: null }, { type: "tool_use", id: "tu_1", name: "delegate_to", input: { instructions: "x" }, caller: { type: "direct" } }] as never },
    false,
  );
  assert.deepEqual(mapped.response.output.map((o) => o.type), ["message", "function_call"]);
  assert.equal((mapped.response.output[1] as { callId: string }).callId, "tu_1");
  assert.deepEqual(mapped.events.map((e) => e.type), ["TEXT_MESSAGE_START", "TEXT_MESSAGE_CONTENT", "TEXT_MESSAGE_END", "TOOL_CALL_START", "TOOL_CALL_ARGS", "TOOL_CALL_END"]);
  assert.equal(extractJson('Here you go:\n```json\n{"a":1}\n```'), '{"a":1}', "JSON pulled out of a fenced reply");
  console.log("ok  AG Studio Claude turn: item, tool and response mapping");
}

// Claude adapter: uses the server turn in claude mode, falls back to local when it fails.
{
  const claudeState = { ...state, aiMode: "claude" as const };
  const reqBody = { input: [user], tools: [], responseFormat: { type: "text" as const } };
  const served = createStudioAdapter(() => claudeState, undefined, async () =>
    new Response(JSON.stringify({ response: { id: "r1", createdAt: 0, status: "completed", model: "claude", output: [{ id: "r1", kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: "from claude", annotations: [] }] }] }, events: [{ type: "TEXT_MESSAGE_START", messageId: "r1", role: "assistant" }, { type: "TEXT_MESSAGE_CONTENT", messageId: "r1", delta: "from claude" }, { type: "TEXT_MESSAGE_END", messageId: "r1" }] }), { status: 200 }),
  );
  const h = served.executeTurn(reqBody);
  const streamed: string[] = [];
  for await (const e of h.stream) if (e.type === "TEXT_MESSAGE_CONTENT") streamed.push(e.delta);
  assert.equal(streamed.join(""), "from claude");
  assert.equal(((await h.complete).output[0] as { content: { text: string }[] }).content[0].text, "from claude");

  const down = createStudioAdapter(() => claudeState, undefined, async () => new Response("{}", { status: 409 }));
  const fb = down.executeTurn({ ...reqBody, tools: tools(["view_page"]) });
  const fbTypes: string[] = [];
  for await (const e of fb.stream) fbTypes.push(e.type);
  assert.ok(fbTypes.includes("TOOL_CALL_START"), "fallback runs the local adapter's tool round trip");
  assert.equal((await fb.complete).output[0].type, "function_call");

  let called = false;
  const offline = createStudioAdapter(() => ({ ...state, aiMode: "deterministic" as const }), undefined, async () => { called = true; return new Response("{}"); });
  await offline.executeTurn(reqBody).complete;
  assert.equal(called, false, "zero-key mode never calls the server");
  console.log("ok  AG Studio Claude adapter: streams server turns, falls back to local on failure or without a key");
}
