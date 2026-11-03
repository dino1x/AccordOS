// The report AG Studio opens with, so the canvas is never empty. Field ids are
// `<source id>.<field id>` from the data sources in StudioCanvas.tsx.
import type { AgReportState, AgWidgetLayoutState } from "ag-studio";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const title = (text: string) => ({ title: { enabled: true, text } });

export const initialStudioReport: AgReportState = {
  selectedPageId: "treasury-overview",
  // Filters and Compose start collapsed so the canvas and AI Assistant have room.
  panels: { filters: { collapsed: true }, edit: { collapsed: true } },
  pages: [
    {
      id: "treasury-overview",
      widgets: {
        "kpi-ledger-volume": { type: "value", dataMapping: { value: [sum("ledger.amount")] }, format: title("Ledger volume") },
        "kpi-tranches": { type: "value", dataMapping: { value: [sum("tranches.amount")] }, format: title("Invoiced tranches") },
        "kpi-holds": { type: "value", dataMapping: { value: [sum("holds.amount")] }, format: title("Authorized holds") },
        "kpi-payouts": { type: "value", dataMapping: { value: [sum("payouts.amount")] }, format: title("Firewall-cleared payouts") },
        "ledger-by-state": {
          type: "bar-chart-grouped",
          dataMapping: { categoryKey: [{ id: "ledger.state" }], valueKey: [sum("ledger.amount")] },
          format: title("Dollar volume by money state"),
        },
        "holds-by-vendor": {
          type: "donut-chart",
          dataMapping: { categoryKey: [{ id: "holds.vendor" }], valueKey: [sum("holds.amount")] },
          format: title("Awarded holds by vendor"),
        },
        "tranches-table": {
          type: "grid",
          dataMapping: { cols: [{ id: "tranches.name" }, { id: "tranches.status" }, { id: "tranches.dueDate" }, sum("tranches.amount"), sum("tranches.settlesAt")] },
          format: title("Milestone tranches and early-pay amounts"),
        },
      },
      widgetLayout: {
        "kpi-ledger-volume": at(0, 0, 6, 7),
        "kpi-tranches": at(6, 0, 6, 7),
        "kpi-holds": at(12, 0, 6, 7),
        "kpi-payouts": at(18, 0, 6, 7),
        "ledger-by-state": at(0, 7, 12, 16),
        "holds-by-vendor": at(12, 7, 12, 16),
        "tranches-table": at(0, 23, 24, 14),
      },
    },
  ],
};
