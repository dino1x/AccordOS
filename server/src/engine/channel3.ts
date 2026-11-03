import { config } from "../config.js";
import { record, scrub } from "../telemetry.js";
import type { LineItem, Sku } from "../types.js";
import { hash } from "./brief.js";

// Fixture catalog used when no Channel3 key is configured. Titles are generic
// and labelled as fixtures in the UI so they are never mistaken for live offers.
const FIXTURES: { match: RegExp; items: [string, number][] }[] = [
  { match: /desk/i, items: [["Electric sit-stand desk, 55 x 28 in, dual motor", 489], ["Sit-stand desk frame with bamboo top, 60 in", 545], ["Commercial height-adjustable desk, 3-stage legs", 612]] },
  { match: /chair/i, items: [["Mesh ergonomic task chair, adjustable lumbar", 329], ["Task chair with 4D arms and seat slide", 386], ["Heavy-duty 24/7 operator chair", 412]] },
  { match: /access point|wifi/i, items: [["Wi-Fi 7 tri-band ceiling access point", 389], ["Wi-Fi 7 enterprise access point, 2.5GbE uplink", 512], ["Wi-Fi 6E ceiling access point", 279]] },
  { match: /switch|poe/i, items: [["24-port gigabit PoE+ managed switch, 400W", 649], ["24-port 2.5GbE PoE++ switch with 10G uplinks", 1180], ["24-port PoE+ smart switch", 455]] },
  { match: /display|tv|screen/i, items: [["65 in 4K commercial display, 18/7 rated", 1290], ["65 in interactive conference display", 1540], ["65 in 4K signage panel", 1045]] },
  { match: /ups|battery/i, items: [["2200VA rack-mount line-interactive UPS", 1290], ["3000VA online double-conversion UPS, 2U", 1720], ["1500VA rack UPS with network card", 980]] },
];

function fixtureSearch(li: LineItem): Sku[] {
  const group = FIXTURES.find((f) => f.match.test(li.query));
  const items = group?.items ?? [[`${li.query} (standard)`, li.maxUnit * 0.8], [`${li.query} (value)`, li.maxUnit * 0.65]];
  return items.map(([title, price], i) => ({
    id: `fx-${hash(`${li.query}${i}`).toString(36)}`,
    title: String(title),
    brand: "Fixture catalog",
    price: Number(price),
    merchant: ["Harbor Office Supply", "Westline Distribution", "Copper Ridge Trade"][i % 3],
    source: "fixture" as const,
  }));
}

function num(v: unknown): number {
  if (typeof v === "number") return v;
  if (typeof v === "string") return Number(v.replace(/[^0-9.]/g, ""));
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return num(o.price ?? o.value ?? o.amount ?? o.current);
  }
  return NaN;
}

// Channel3 usually answers in 2-6 s but occasionally takes longer.
const TIMEOUT_MS = 12_000;
// Last good live result per query, reused if Channel3 is slow, so a reset never drops to fixtures.
const lastGood = new Map<string, Sku[]>();

async function channel3Search(li: LineItem, attempt: number): Promise<Sku[]> {
  const started = performance.now();
  const path = "/v1/search";
  const body = { query: li.query, limit: 6 };
  let status = 0;
  try {
    const res = await fetch(`${config.channel3.base}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": config.channel3.key },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = res.status;
    const data: any = await res.json();
    const list: any[] = Array.isArray(data) ? data : data.products ?? data.results ?? data.data ?? [];
    const skus: Sku[] = list
      .map((p: any, i: number) => {
        const brand = String(p.brands?.[0]?.name ?? p.brand ?? p.brand_name ?? "").trim();
        const rawTitle = String(p.title ?? p.name ?? li.query).trim();
        const title = brand && !rawTitle.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${rawTitle}` : rawTitle;
        return {
          id: String(p.id ?? p.product_id ?? `c3-${i}`),
          title,
          brand,
          price: num(p.price ?? p.offers?.[0]?.price),
          merchant: String(p.merchant ?? p.merchant_name ?? p.offers?.[0]?.merchant ?? p.offers?.[0]?.domain ?? ""),
          imageUrl: p.image_url ?? p.images?.[0]?.url ?? p.images?.[0],
          url: p.url ?? p.offers?.[0]?.url,
          source: "channel3" as const,
        };
      })
      .filter((s) => Number.isFinite(s.price) && s.price > 0);
    record({ origin: "channel3", method: "POST", path: attempt > 1 ? `${path} (retry)` : path, status, ms: Math.round(performance.now() - started), request: body, response: scrub(skus.slice(0, 3)) });
    if (!res.ok || skus.length === 0) throw new Error(`Channel3 returned ${skus.length} usable products`);
    return skus;
  } catch (err) {
    record({ origin: "channel3", method: "POST", path: attempt > 1 ? `${path} (retry)` : path, status, ms: Math.round(performance.now() - started), request: body, error: err instanceof Error ? err.message : String(err) });
    throw err;
  }
}

export async function searchSkus(li: LineItem): Promise<{ skus: Sku[]; source: Sku["source"]; error?: string }> {
  if (config.channel3.key) {
    let error = "";
    for (const attempt of [1, 2]) {
      try {
        const skus = await channel3Search(li, attempt);
        lastGood.set(li.query, skus);
        return { skus, source: "channel3" };
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
    }
    const cached = lastGood.get(li.query);
    if (cached) return { skus: cached, source: "channel3", error: `${error}; reused the last live Channel3 results` };
    return { skus: fixtureSearch(li), source: "fixture", error };
  }
  return { skus: fixtureSearch(li), source: "fixture" };
}

// Picks the best-value SKU at or under the brief's unit ceiling.
export function pickSku(skus: Sku[], maxUnit: number): Sku {
  const affordable = skus.filter((s) => s.price <= maxUnit);
  const pool = affordable.length ? affordable : skus;
  return [...pool].sort((a, b) => b.price - a.price)[Math.min(1, pool.length - 1)] ?? pool[0];
}
