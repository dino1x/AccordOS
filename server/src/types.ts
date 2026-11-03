// Shared domain types. The web client imports this file with `import type` only.

export type Mode = "live" | "replay";
export type MoneyState = "draft" | "invoiced" | "authorized" | "captured" | "paidout" | "blocked" | "disputed";

export interface Milestone {
  id: string;
  name: string;
  pct: number;
  dueDay: number;
  deliverable: string;
}

export interface LineItem {
  id: string;
  query: string;
  qty: number;
  category: string;
  maxUnit: number;
}

export interface Brief {
  id: string;
  title: string;
  client: { name: string; email: string };
  budget: number;
  currency: "USD";
  startDate: string;
  milestones: Milestone[];
  lineItems: LineItem[];
  terms: { earlyPayDiscountPct: number; earlyPayDays: number; netDays: number };
  source: "claude" | "deterministic";
  rawText: string;
}

export interface AllocOption {
  label: string;
  cost: number;
  utility: number;
  detail: string;
}

export interface AllocCategory {
  key: "procurement" | "crew" | "contingency";
  label: string;
  options: AllocOption[];
  chosen: AllocOption;
}

export interface Allocation {
  budget: number;
  unit: number;
  categories: AllocCategory[];
  total: number;
  utility: number;
  statesExplored: number;
  micros: number;
  feasible: boolean;
}

export interface Tranche {
  id: string;
  milestoneId: string;
  name: string;
  amount: number;
  dueDate: string;
  status: "draft" | "sent" | "paid";
  invoiceId?: string;
  invoiceNumber?: string;
  qr?: string;
  payerViewUrl?: string;
  earlyPay: { discountPct: number; withinDays: number; discountedAmount: number };
  reminders: number;
}

export interface Sku {
  id: string;
  title: string;
  brand: string;
  price: number;
  merchant: string;
  imageUrl?: string;
  url?: string;
  source: "channel3" | "fixture";
}

export interface VendorAgent {
  id: string;
  name: string;
  strategy: string;
  payeeEmail: string;
  reliability: number;
}

export interface Bid {
  round: number;
  vendorId: string;
  unitPrice: number;
  total: number;
  slaDays: number;
  score: number;
  note: string;
  withdrawn: boolean;
}

export interface PolicyRule {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface PolicyDecision {
  allowed: boolean;
  requiresHuman: boolean;
  rules: PolicyRule[];
}

export interface Auction {
  id: string;
  lineItemId: string;
  sku: Sku;
  qty: number;
  vendors: VendorAgent[];
  rounds: Bid[][];
  winnerId: string;
  winningBid: Bid;
  openingTotal: number;
  savings: number;
  policy: PolicyDecision;
  holdId?: string;
}

export interface Hold {
  id: string;
  orderId: string;
  auctionId: string;
  vendorId: string;
  amount: number;
  status: "created" | "approved" | "authorized" | "captured" | "voided";
  authorizationId?: string;
  captureId?: string;
  approveUrl?: string;
  // Live mode only: authorized without a PayPal buyer approval (simulated).
  fastForwarded?: boolean;
  tracking?: { carrier: string; number: string; status: string };
}

export type GateKind = "invoice" | "hold" | "shipment";

export interface Task {
  id: string;
  name: string;
  resource: string;
  start: number;
  duration: number;
  deps: string[];
  gate?: { kind: GateKind; ref: string; label: string; satisfied: boolean };
  status: "blocked" | "ready" | "active" | "done";
  critical: boolean;
}

export interface ScheduleEvent {
  id: string;
  ts: string;
  kind: "invoice.paid" | "hold.authorized" | "hold.captured" | "shipment.delayed" | "shipment.delivered" | "dispute.created" | "dispute.resolved" | "payouts.sent";
  label: string;
  diff: { taskId: string; from: number; to: number }[];
  narrative: string;
}

export interface LedgerRow {
  id: string;
  ts: string;
  from: string;
  to: string;
  amount: number;
  state: MoneyState;
  ref: string;
  api: string;
  memo: string;
  actions: ("capture" | "void" | "remind" | "dispute")[];
}

export interface TelemetryRecord {
  id: string;
  ts: string;
  origin: "mcp" | "apimatic-sdk" | "rest" | "replay" | "claude" | "channel3";
  mcpTool?: string;
  method: string;
  path: string;
  status: number;
  ms: number;
  request?: unknown;
  response?: unknown;
  error?: string;
}

export interface Attack {
  id: string;
  name: string;
  vector: string;
  description: string;
  instruction: PaymentInstruction;
}

export interface PaymentInstruction {
  payeeEmail: string;
  amount: number;
  currency: string;
  reference: string;
  memo: string;
  vendorId: string;
  category: "procurement" | "crew" | "contingency";
}

export interface FirewallCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
}

export interface FirewallVerdict {
  attackId: string;
  blocked: boolean;
  firstFailure?: string;
  checks: FirewallCheck[];
  micros: number;
  paypalCalls: number;
}

export interface Dossier {
  summary: string;
  evidence: { label: string; ref: string; detail: string }[];
  source: "claude" | "deterministic";
  submitted: boolean;
  submitNote: string;
}

export interface Dispute {
  id: string;
  holdId: string;
  reason: string;
  amount: number;
  status: "open" | "evidence_submitted" | "resolved";
  createdAt: string;
  dossier?: Dossier;
}

export interface Payout {
  batchId: string;
  status: string;
  items: { receiver: string; amount: number; note: string }[];
}

export type WidgetKind = "anomaly" | "margin" | "nudge";

export interface Widget {
  id: string;
  kind: WidgetKind;
  title: string;
  prompt: string;
  source: "claude" | "deterministic";
  params: Record<string, number>;
}

export interface AppState {
  version: number;
  mode: Mode;
  aiMode: "claude" | "deterministic";
  catalogMode: "channel3" | "fixture";
  ready: boolean;
  brief: Brief | null;
  allocation: Allocation | null;
  tranches: Tranche[];
  auctions: Auction[];
  holds: Hold[];
  tasks: Task[];
  events: ScheduleEvent[];
  ledger: LedgerRow[];
  disputes: Dispute[];
  payouts: Payout[];
  widgets: Widget[];
  dayZero: string;
}
