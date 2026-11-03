import { EventEmitter } from "node:events";
import type { TelemetryRecord } from "./types.js";

const MAX = 300;
const records: TelemetryRecord[] = [];
let seq = 0;

export const bus = new EventEmitter();
bus.setMaxListeners(100);

export function record(r: Omit<TelemetryRecord, "id" | "ts">): TelemetryRecord {
  const full: TelemetryRecord = { id: `t${++seq}`, ts: new Date().toISOString(), ...r };
  records.unshift(full);
  if (records.length > MAX) records.length = MAX;
  bus.emit("telemetry", full);
  return full;
}

export function listTelemetry(): TelemetryRecord[] {
  return records;
}

export function restoreTelemetry(items: TelemetryRecord[]): void {
  if (!Array.isArray(items) || records.length > 0) return;
  records.push(...items.slice(0, MAX));
  seq = Math.max(seq, records.length);
}

// Redacts secrets and very large payloads before they are stored or shown.
export function scrub(value: unknown): unknown {
  if (value == null) return value;
  const text = JSON.stringify(value, (key, v) => {
    if (/token|secret|authorization/i.test(key)) return "[redacted]";
    if (typeof v === "string" && v.length > 400) return `${v.slice(0, 120)}... [${v.length} chars]`;
    return v;
  });
  return text === undefined ? undefined : JSON.parse(text);
}
