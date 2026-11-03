// A zero-key AgLlmAdapter for the AG Studio AI panel. It answers from live
// AccordOS state with deterministic code, adds known widgets to the canvas
// through the Studio API, and streams the reply as AG-UI events, so the
// Studio Agent Framework works with no model key.
import type { AgAiEvent, AgAiPromptStarter, AgLlmAdapter, AgLlmRequest, AgLlmResponse, AgReportState } from "ag-studio";
import type { AppState } from "../../../server/src/types";
import { money } from "../lib/format";

export const PROMPT_STARTERS: AgAiPromptStarter[] = [
  { label: "Summarise this page", prompt: "Summarise this page" },
  { label: "Show holds by vendor", prompt: "Show holds by vendor" },
  { label: "Which tranches are unpaid?", prompt: "Which tranches are unpaid?" },
  { label: "What did the firewall block?", prompt: "What did the firewall block?" },
  { label: "Add a chart of payouts by receiver", prompt: "Add a chart of payouts by receiver" },
];

// The subset of AgStudioApi the adapter needs, so tests can pass a stub.
export interface StudioStateApi {
  getState(): AgReportState;
  setState(state: AgReportState): void;
}

type PageWidget = NonNullable<NonNullable<AgReportState["pages"][number]["widgets"]>[string]>;

const sum = (id: string) => ({ id, aggregation: "sum" as const });

// Widgets the offline assistant knows how to add, keyed by widget id.
export const ADDABLE_WIDGETS: Record<string, { match: RegExp; label: string; widget: PageWidget; empty: (s: AppState) => string | null }> = {
  "payouts-by-receiver": {
    match: /payouts?|receiver/i,
    label: "a bar chart of payouts by receiver",
    widget: { type: "bar-chart-grouped", dataMapping: { categoryKey: [{ id: "payouts.receiver" }], valueKey: [sum("payouts.amount")] }, format: { title: { enabled: true, text: "Payouts by receiver" } } },
    empty: (s) => (s.payouts.length ? null : "No payouts have cleared yet, so it is empty until you run firewall-gated payouts above."),
  },
  "holds-by-status": {
    match: /holds?.*status|status.*holds?/i,
    label: "a donut chart of holds by status",
    widget: { type: "donut-chart", dataMapping: { categoryKey: [{ id: "holds.status" }], valueKey: [sum("holds.amount")] }, format: { title: { enabled: true, text: "Holds by status" } } },
    empty: (s) => (s.holds.length ? null : "There are no holds yet, so it is empty until holds are placed in the Bake-Off stage."),
  },
};

export const ADD_WIDGET_INTENT = /add.*(chart|widget|graph)|payouts by receiver|holds by status/i;

// Appends a known widget to the selected page, below everything already on it.
// State is replaced immutably, as AG Studio compares by reference.
export function addWidget(api: StudioStateApi, prompt: string, s: AppState): string {
  const entry = Object.entries(ADDABLE_WIDGETS).find(([, w]) => w.match.test(prompt));
  if (!entry) {
    return `I can add ${Object.values(ADDABLE_WIDGETS).map((w) => w.label).join(" or ")}. Ask for one of those by name.`;
  }
  const [widgetId, def] = entry;
  const report = api.getState();
  const page = report.pages.find((p) => p.id === report.selectedPageId) ?? report.pages[0];
  if (!page) return "There is no page on the canvas to add a widget to.";
  if (page.widgets?.[widgetId]) return `${def.label[0].toUpperCase()}${def.label.slice(1)} is already on the canvas as \`${widgetId}\`.`;
  const layouts = Object.values(page.widgetLayout ?? {}).filter((l): l is NonNullable<typeof l> => !!l);
  const yTrack = layouts.reduce((max, l) => Math.max(max, l.yTrack + l.ySpan), 0);
  api.setState({
    ...report,
    pages: report.pages.map((p) =>
      p.id !== page.id
        ? p
        : {
            ...p,
            widgets: { ...p.widgets, [widgetId]: def.widget },
            widgetLayout: { ...p.widgetLayout, [widgetId]: { xTrack: 0, yTrack, xSpan: 24, ySpan: 14 } },
          },
    ),
  });
  const note = def.empty(s);
  return `Added ${def.label} to the canvas as \`${widgetId}\`, full width at the bottom of the page.${note ? ` ${note}` : ""}`;
}

function lastUserText(req: AgLlmRequest): string {
  for (let i = req.input.length - 1; i >= 0; i--) {
    const item = req.input[i];
    if (item.type === "message" && item.role === "user") {
      return item.content.map((c) => (c.type === "text" ? c.text : "")).join(" ").trim();
    }
  }
  return "";
}

function summarise(s: AppState): string {
  const vol = (pred: (st: string) => boolean) => s.ledger.filter((r) => pred(r.state)).reduce((t, r) => t + r.amount, 0);
  const paid = s.tranches.filter((t) => t.status === "paid");
  const holds = s.holds.filter((h) => h.status !== "voided");
  const paidOut = s.payouts.flatMap((p) => p.items).reduce((t, i) => t + i.amount, 0);
  const blocked = s.ledger.filter((r) => r.state === "blocked");
  return [
    `**${s.brief?.title ?? "No project loaded"}** for ${s.brief?.client.name ?? "no client"}, budget ${money(s.brief?.budget ?? 0)}.`,
    "",
    `- **Tranches:** ${paid.length} of ${s.tranches.length} paid, ${money(paid.reduce((t, x) => t + x.amount, 0))} settled.`,
    `- **Holds:** ${holds.length} active, ${money(holds.reduce((t, h) => t + h.amount, 0))} across ${new Set(holds.map((h) => h.vendorId)).size} vendors (${holds.filter((h) => h.status === "captured").length} captured).`,
    `- **Captured into escrow:** ${money(vol((st) => st === "captured"))}. **Paid out:** ${money(paidOut)}.`,
    `- **Firewall:** ${blocked.length} payment instructions blocked, ${money(blocked.reduce((t, r) => t + r.amount, 0))} stopped before any PayPal call.`,
    `- **Disputes open:** ${s.disputes.filter((d) => d.status !== "resolved").length}.`,
  ].join("\n");
}

function holdsByVendor(s: AppState): string {
  const vendors = s.auctions.flatMap((a) => a.vendors).filter((v, i, all) => all.findIndex((x) => x.id === v.id) === i);
  const rows = vendors
    .map((v) => {
      const own = s.holds.filter((h) => h.vendorId === v.id && h.status !== "voided");
      return { name: v.name, n: own.length, total: own.reduce((t, h) => t + h.amount, 0), captured: own.filter((h) => h.status === "captured").length };
    })
    .filter((r) => r.n > 0)
    .sort((a, b) => b.total - a.total);
  if (!rows.length) return "No holds yet. Place holds from the Bake-Off stage.";
  return ["| Vendor | Holds | Captured | Amount |", "| --- | ---: | ---: | ---: |", ...rows.map((r) => `| ${r.name} | ${r.n} | ${r.captured} | ${money(r.total)} |`), "", "The donut chart on this page shows the same split."].join("\n");
}

function unpaid(s: AppState): string {
  const open = s.tranches.filter((t) => t.status !== "paid");
  if (!open.length) return "Every tranche is paid.";
  return [
    "| Tranche | Status | Due | Amount | Early-pay amount |",
    "| --- | --- | --- | ---: | ---: |",
    ...open.map((t) => `| ${t.name} | ${t.status === "sent" ? "Invoiced" : "Not issued"} | ${t.dueDate} | ${money(t.amount)} | ${money(t.earlyPay.discountedAmount)} |`),
    "",
    `Total outstanding: **${money(open.reduce((x, t) => x + t.amount, 0))}**. Use Nudge in the scoreboard above to send a PayPal reminder.`,
  ].join("\n");
}

function blocked(s: AppState): string {
  const rows = s.ledger.filter((r) => r.state === "blocked");
  if (!rows.length) return "Nothing blocked yet. Run the bench in the Red-Team stage.";
  return ["| Entry | Payee | Amount | Reason |", "| --- | --- | ---: | --- |", ...rows.slice(0, 12).map((r) => `| ${r.id} | ${r.to} | ${money(r.amount)} | ${r.memo} |`), rows.length > 12 ? `\n+${rows.length - 12} more.` : ""].join("\n");
}

export function answer(prompt: string, s: AppState): string {
  const p = prompt.toLowerCase();
  if (/vendor|hold/.test(p)) return holdsByVendor(s);
  if (/unpaid|owe|outstanding|tranche|invoice/.test(p)) return unpaid(s);
  if (/firewall|block|fraud|attack/.test(p)) return blocked(s);
  if (/summar|overview|page|status/.test(p)) return summarise(s);
  return `${summarise(s)}\n\nI am the offline AccordOS analyst. Ask about holds by vendor, unpaid tranches or what the firewall blocked.`;
}

let seq = 0;

function title(prompt: string): string {
  const t = prompt.replace(/[?.!]+$/, "").trim();
  return t.length > 40 ? `${t.slice(0, 37)}...` : t || "AccordOS analysis";
}

// Reads the widget count out of Studio's view_page result, whatever its exact shape.
function widgetsOnPage(output: string | undefined): number | null {
  if (!output) return null;
  try {
    const parsed = JSON.parse(output);
    const widgets = parsed?.widgets ?? parsed?.page?.widgets;
    if (Array.isArray(widgets)) return widgets.length;
    if (widgets && typeof widgets === "object") return Object.keys(widgets).length;
  } catch {
    // not JSON: fall through to a text count
  }
  const ids = output.match(/kpi-[a-z-]+|ledger-by-state|holds-by-vendor|tranches-table/g);
  return ids ? new Set(ids).size : null;
}

function stream(events: AgAiEvent[]) {
  return {
    async *[Symbol.asyncIterator]() {
      for (const e of events) {
        await new Promise((r) => setTimeout(r, 12));
        yield e;
      }
    },
  };
}

export function createLocalAdapter(getState: () => AppState | null, api?: StudioStateApi): AgLlmAdapter {
  return {
    executeTurn(request: AgLlmRequest) {
      const id = `accord-${++seq}`;
      const prompt = lastUserText(request);
      const toolNames = new Set((request.tools ?? []).map((t) => t.name));
      const lastUser = request.input.map((i) => i.type === "message" && i.role === "user").lastIndexOf(true);
      const since = request.input.slice(lastUser + 1);
      const calledTools = since.some((i) => i.type === "function_call");

      // First turn after a question: use Studio's own tools to name the thread
      // and inspect the live page, then answer on the next turn.
      if (!calledTools && request.responseFormat.type === "text" && toolNames.has("view_page")) {
        const calls = [
          ...(toolNames.has("rename_thread") ? [{ name: "rename_thread", args: { name: title(prompt) } }] : []),
          { name: "view_page", args: {} },
        ].map((c, n) => ({ ...c, callId: `${id}-call-${n}`, json: JSON.stringify(c.args) }));
        const events: AgAiEvent[] = calls.flatMap((c): AgAiEvent[] => [
          { type: "TOOL_CALL_START", toolCallId: c.callId, toolCallName: c.name },
          { type: "TOOL_CALL_ARGS", toolCallId: c.callId, delta: c.json },
          { type: "TOOL_CALL_END", toolCallId: c.callId },
        ]);
        const response: AgLlmResponse = {
          id,
          createdAt: Date.now(),
          status: "completed",
          model: "accordos-local",
          output: calls.map((c) => ({ id: c.callId, kind: "output" as const, type: "function_call" as const, callId: c.callId, name: c.name, arguments: c.json, status: "completed" as const })),
        };
        return { stream: stream(events), complete: Promise.resolve(response) };
      }

      const state = getState();
      const viewPageCall = since.find((i) => i.type === "function_call" && i.name === "view_page");
      const viewPageResult = since.find((i) => i.type === "function_call_output" && viewPageCall && i.callId === (viewPageCall as { callId: string }).callId);
      const count = widgetsOnPage(viewPageResult && "output" in viewPageResult ? viewPageResult.output : undefined);
      const context = count !== null ? `\n\nChecked the live page with the \`view_page\` tool: ${count} widgets on the canvas.` : "";
      const isJson = request.responseFormat.type === "json";
      let text = "AccordOS data is still loading.";
      if (state && !isJson && api && ADD_WIDGET_INTENT.test(prompt)) {
        const widgetsBefore = Object.keys(api.getState().pages.find((p) => p.id === api.getState().selectedPageId)?.widgets ?? {}).length;
        const reply = addWidget(api, prompt, state);
        const widgetsAfter = Object.keys(api.getState().pages.find((p) => p.id === api.getState().selectedPageId)?.widgets ?? {}).length;
        text = reply + (count !== null && widgetsAfter > widgetsBefore ? `\n\nThe page had ${count} widgets when \`view_page\` read it and now has ${widgetsAfter}.` : context);
      }
      else if (state) text = answer(prompt, state) + context;
      // Structured-output turns get an empty JSON object; chat turns get the answer.
      const body = isJson ? "{}" : text;
      const chunks = body.match(/[\s\S]{1,48}/g) ?? [""];
      const events: AgAiEvent[] = [
        { type: "TEXT_MESSAGE_START", messageId: id, role: "assistant" },
        ...chunks.map((delta): AgAiEvent => ({ type: "TEXT_MESSAGE_CONTENT", messageId: id, delta })),
        { type: "TEXT_MESSAGE_END", messageId: id },
      ];
      const response: AgLlmResponse = {
        id,
        createdAt: Date.now(),
        status: "completed",
        model: "accordos-local",
        output: [{ id, kind: "output", type: "message", role: "assistant", status: "completed", content: [{ type: "text", text: body, annotations: [] }] }],
      };
      return { stream: stream(events), complete: Promise.resolve(response) };
    },
  };
}

// Compact project facts sent with each Claude turn so the assistant can answer
// about AccordOS while it uses Studio's tools on the report.
export function projectContext(s: AppState): string {
  return [summarise(s), "### Holds by vendor", holdsByVendor(s), "### Unpaid tranches", unpaid(s), "### Firewall blocks", blocked(s)].join("\n\n");
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

// Claude-backed adapter: each Studio turn runs on the server through
// POST /api/studio/turn and the returned AG-UI events are streamed back.
// If the server has no key, is rate limited or fails, the turn is answered
// by the local adapter instead, so the assistant never dead-ends.
export function createStudioAdapter(getState: () => AppState | null, api?: StudioStateApi, fetchImpl: Fetch = (i, init) => fetch(i, init)): AgLlmAdapter {
  const local = createLocalAdapter(getState, api);
  return {
    executeTurn(request: AgLlmRequest, options) {
      const state = getState();
      if (state?.aiMode !== "claude") return local.executeTurn(request, options);
      let fallback: ReturnType<AgLlmAdapter["executeTurn"]> | null = null;
      const useLocal = () => (fallback ??= local.executeTurn(request, options));
      const remote = fetchImpl("/api/studio/turn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request, context: projectContext(state) }),
        signal: options?.signal,
      }).then(async (res) => {
        if (!res.ok) throw new Error(`studio turn ${res.status}`);
        return (await res.json()) as { response: AgLlmResponse; events: AgAiEvent[] };
      });
      return {
        stream: {
          async *[Symbol.asyncIterator]() {
            let events: AgAiEvent[];
            try {
              events = (await remote).events;
            } catch {
              yield* useLocal().stream;
              return;
            }
            for (const e of events) {
              await new Promise((r) => setTimeout(r, 8));
              yield e;
            }
          },
        },
        complete: remote.then((r) => r.response).catch(() => useLocal().complete),
      };
    },
  };
}
