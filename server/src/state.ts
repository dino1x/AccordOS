import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { aiMode, catalogMode, paypalMode } from "./config.js";
import { bus, listTelemetry, restoreTelemetry } from "./telemetry.js";
import type { AppState, LedgerRow, TelemetryRecord } from "./types.js";

const SNAPSHOT_FILE = path.join(os.tmpdir(), "accordos-snapshot.json");

export function emptyState(): AppState {
  return {
    version: 0,
    mode: paypalMode,
    aiMode,
    catalogMode,
    ready: false,
    brief: null,
    allocation: null,
    tranches: [],
    auctions: [],
    holds: [],
    tasks: [],
    events: [],
    ledger: [],
    disputes: [],
    payouts: [],
    widgets: [],
    dayZero: new Date().toISOString().slice(0, 10),
  };
}

export let state: AppState = emptyState();
let ledgerSeq = 0;

try {
  if (process.env.VERCEL && fs.existsSync(SNAPSHOT_FILE)) {
    const raw = JSON.parse(fs.readFileSync(SNAPSHOT_FILE, "utf8")) as { state?: AppState; telemetry?: TelemetryRecord[]; ledgerSeq?: number };
    if (raw.state?.ready && raw.state.mode === paypalMode && raw.state.aiMode === aiMode && raw.state.catalogMode === catalogMode) {
      state = raw.state;
      ledgerSeq = raw.ledgerSeq ?? state.ledger.length;
      if (raw.telemetry) restoreTelemetry(raw.telemetry);
    }
  }
} catch {
  // Ignore corrupt or missing tmp snapshot
}

export function resetState(): void {
  state = emptyState();
}

export function commit(): AppState {
  state.version += 1;
  bus.emit("state", state);
  // Vercel only: lets a warm function instance resume after a restart. Local
  // servers never write it, so they cannot leak state into each other.
  if (process.env.VERCEL) {
    try {
      fs.writeFileSync(SNAPSHOT_FILE, JSON.stringify({ state, telemetry: listTelemetry(), ledgerSeq }));
    } catch {
      // Ignore read-only filesystem errors
    }
  }
  return state;
}

export function addLedger(row: Omit<LedgerRow, "id" | "ts">): LedgerRow {
  const full: LedgerRow = { id: `L${String(++ledgerSeq).padStart(4, "0")}`, ts: new Date().toISOString(), ...row };
  state.ledger.unshift(full);
  return full;
}

export function updateLedger(ref: string, patch: Partial<LedgerRow>): void {
  for (const row of state.ledger) if (row.ref === ref) Object.assign(row, patch);
}
