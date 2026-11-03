// AG Studio self-serve analytics canvas bound to live AccordOS data.
import { AgStudioAiModule, createAiHarness, studioTheme, type AgAiHarnessSetup, type AgDataSourcesDefinition } from "ag-studio";
import { AgStudio, AgStudioProvider } from "ag-studio-react";
import { useMemo, useRef } from "react";
import type { AppState } from "../../../server/src/types";
import { createStudioAdapter, PROMPT_STARTERS } from "./studioAi";
import { initialStudioReport } from "./studioReport";

export const accordStudioTheme = studioTheme.withParams({
  fontSize: 13,
  studioWrapperBorder: false,
  studioCanvasPadding: 16,
  studioWidgetBorderRadius: 14,
  gridRowHeight: 38,
  backgroundColor: "var(--ink-1)",
  foregroundColor: "var(--text-0)",
  accentColor: "var(--accent)",
  borderColor: "var(--line)",
  fontFamily: "var(--sans)",
  studioCanvasBackgroundColor: "var(--ink-2)",
  studioWidgetBackgroundColor: "var(--ink-1)",
  studioWidgetTitleFontWeight: 500,
  studioPanelContainerBackgroundColor: "var(--ink-1)",
  // Charts render to canvas, so the palette is literal colors that read on paper and charcoal.
  chartFontFamily: "Geist, -apple-system, sans-serif",
  chartPaletteFills1Color: "#5f8072",
  chartPaletteFills2Color: "#c4a15a",
  chartPaletteFills3Color: "#7a8fb8",
  chartPaletteFills4Color: "#d08770",
  chartPaletteFills5Color: "#8a7fc9",
  chartPaletteFills6Color: "#6fb5b0",
  chartPaletteFills7Color: "#a39d8a",
  chartPaletteFills8Color: "#93bba6",
});

function sources(s: AppState): AgDataSourcesDefinition {
  const vendorName = (vendorId: string) => s.auctions.flatMap((a) => a.vendors).find((v) => v.id === vendorId)?.name ?? vendorId;
  return {
    description: "AccordOS commercial execution desk: PayPal tranche invoices, Orders v2 authorization holds, Payouts v1 disbursements and the chain-of-custody ledger for one client project.",
    sources: [
      {
        id: "ledger",
        name: "Ledger",
        description: "Every dollar movement from client to escrow to vendor, with the PayPal API that moved it.",
        data: s.ledger.map((r) => ({ id: r.id, ts: r.ts.slice(0, 10), from: r.from, to: r.to, state: r.state, api: r.api, amount: r.amount })),
        fields: [
          { id: "id", name: "Entry", format: "textFormat" },
          { id: "ts", name: "Date", format: "textFormat" },
          { id: "from", name: "From", format: "textFormat" },
          { id: "to", name: "To", format: "textFormat" },
          { id: "state", name: "Money state", format: "textFormat" },
          { id: "api", name: "PayPal API", format: "textFormat" },
          { id: "amount", name: "Amount (USD)", format: "currencyFormat" },
        ],
      },
      {
        id: "tranches",
        name: "Tranches",
        description: "Milestone invoices issued through PayPal Invoicing v2, with early-payment terms.",
        data: s.tranches.map((t) => ({ id: t.id, name: t.name, status: t.status, dueDate: t.dueDate, amount: t.amount, settlesAt: t.earlyPay.discountedAmount, reminders: t.reminders })),
        fields: [
          { id: "id", name: "Tranche", format: "textFormat" },
          { id: "name", name: "Milestone", format: "textFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "dueDate", name: "Due date", format: "textFormat" },
          { id: "amount", name: "Amount (USD)", format: "currencyFormat" },
          { id: "settlesAt", name: "Early-pay amount (USD)", format: "currencyFormat" },
          { id: "reminders", name: "Reminders", format: "integerFormat" },
        ],
      },
      {
        id: "holds",
        name: "Holds",
        description: "Orders v2 AUTHORIZE holds placed for vendor awards, captured at dispatch.",
        data: s.holds.map((h) => {
          const a = s.auctions.find((x) => x.id === h.auctionId);
          return { id: h.id, vendor: vendorName(h.vendorId), item: a ? a.sku.title : h.auctionId, quantity: a?.qty ?? 0, status: h.status, carrier: h.tracking?.carrier ?? "", amount: h.amount };
        }),
        fields: [
          { id: "id", name: "Hold", format: "textFormat" },
          { id: "vendor", name: "Vendor", format: "textFormat" },
          { id: "item", name: "Item", format: "textFormat" },
          { id: "quantity", name: "Quantity", format: "integerFormat" },
          { id: "status", name: "Status", format: "textFormat" },
          { id: "carrier", name: "Carrier", format: "textFormat" },
          { id: "amount", name: "Amount (USD)", format: "currencyFormat" },
        ],
      },
      {
        id: "payouts",
        name: "Payouts",
        description: "Payouts v1 disbursements that cleared the AccordOS payment firewall.",
        data: s.payouts.flatMap((p) => p.items.map((i, n) => ({ id: `${p.batchId}-${n + 1}`, batch: p.batchId, receiver: i.receiver, category: i.note.match(/^\[(\w+)\]/)?.[1] ?? "other", amount: i.amount }))),
        fields: [
          { id: "id", name: "Item", format: "textFormat" },
          { id: "batch", name: "Batch", format: "textFormat" },
          { id: "receiver", name: "Receiver", format: "textFormat" },
          { id: "category", name: "Category", format: "textFormat" },
          { id: "amount", name: "Amount (USD)", format: "currencyFormat" },
        ],
      },
    ],
  };
}

export function StudioCanvas({ state }: { state: AppState }) {
  const data = useMemo(() => sources(state), [state.version]);
  const live = useRef(state);
  live.current = state;
  // Built once: the harness reads the latest state through the ref on every turn.
  const ai = useMemo<AgAiHarnessSetup>(
    () => ({ api }) => {
      return createAiHarness(api, { adapter: createStudioAdapter(() => live.current, api), promptStarters: PROMPT_STARTERS });
    },
    [],
  );
  return (
    <div style={{ height: 720, width: "100%" }}>
      <AgStudioProvider modules={[AgStudioAiModule]}>
        <AgStudio style={{ height: "100%", width: "100%" }} theme={accordStudioTheme} data={data} initialState={initialStudioReport} ai={ai} mode="edit" />
      </AgStudioProvider>
    </div>
  );
}
