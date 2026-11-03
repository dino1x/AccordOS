// A one-click guided walkthrough for judges: five beats, one per stage, each
// doing one real action (PayPal, schedule reflow, payouts, red-team) and
// narrating it in a banner under the status bar.
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import type { AppState, FirewallVerdict } from "../../../server/src/types";
import { api, post } from "../lib/api";
import { money } from "../lib/format";
import type { StageId } from "./Shell";
import { useToast } from "./ui";

const BEAT_MS = 5600;

export const OPEN_DRAWER_EVENT = "accordos:open-drawer";
export const REDTEAM_RESULT_EVENT = "accordos:redteam-result";
export type RedTeamResult = { verdicts: (FirewallVerdict & { name: string })[]; totalMicros: number };

interface Step {
  stage: StageId;
  title: string;
  run: (s: AppState) => Promise<string>;
}

const latest = () => api<AppState>("/state");

const STEPS: Step[] = [
  {
    stage: "tranche",
    title: "Brief to funded tranches",
    run: async (s) => {
      const parsed = `Brief parsed by ${s.brief?.source === "claude" ? "Claude" : "rules"}, budget split exactly by a DP allocator, and each milestone issued as a PayPal Invoicing v2 invoice with a scannable QR code.`;
      const t2 = s.tranches[1];
      if (t2?.status === "sent") {
        await post(`/tranches/${t2.id}/pay`);
        return `${parsed} "${t2.name}" just settled at its early-pay amount, so its schedule gate clears.`;
      }
      return parsed;
    },
  },
  {
    stage: "bakeoff",
    title: "Channel3 sourcing and reverse auction",
    run: async (s) => {
      const waiting = s.holds.find((h) => h.status === "created");
      if (waiting) await post(`/holds/${waiting.id}/authorize`);
      const now = await latest();
      const held = now.holds.find((h) => h.status === "authorized");
      if (held) {
        await post(`/holds/${held.id}/capture`);
        return `Three vendor agents bid and the policy vault passed the winner. A ${money(held.amount)} Orders v2 hold was authorized${held.fastForwarded ? " (fast-forwarded, labelled simulated)" : ""} and captured at dispatch, with shipment tracking attached.`;
      }
      return "Each line item is sourced through Channel3, then three vendor agents bid it down. Winners become Orders v2 AUTHORIZE holds only after the policy vault passes them.";
    },
  },
  {
    stage: "schedule",
    title: "Payment-gated schedule reflow",
    run: async () => {
      await post("/schedule/delay", { days: 3 });
      return "The carrier reported a 3-day delay. Watch the dependency Gantt and the Bryntum Scheduler shift every downstream booking, and the operations agent explain what moved.";
    },
  },
  {
    stage: "ledger",
    title: "Chain of custody and payouts",
    run: async (s) => {
      if (s.holds.some((h) => h.status === "captured")) {
        try {
          await post("/payouts");
          return "Captured funds passed the payment firewall and went out as a PayPal Payouts v1 batch. Every dollar is traced in the AG Grid ledger and the AG Studio dashboard.";
        } catch {
          // nothing left to disburse: fall through to the description
        }
      }
      return "Every dollar from client to escrow to vendor, with the PayPal call that moved it, in the AG Grid ledger and the AG Studio dashboard.";
    },
  },
  {
    stage: "redteam",
    title: "Prove it: red-team the firewall",
    run: async () => {
      const r = await post<RedTeamResult>("/redteam/run", {});
      window.dispatchEvent(new CustomEvent(REDTEAM_RESULT_EVENT, { detail: r }));
      window.dispatchEvent(new Event(OPEN_DRAWER_EVENT));
      const attacks = r.verdicts.filter((v) => v.attackId !== "control");
      const control = r.verdicts.find((v) => v.attackId === "control");
      return `${attacks.filter((v) => v.blocked).length}/${attacks.length} attacks blocked in ${r.totalMicros}us with 0 PayPal calls, and the clean control ${control?.blocked ? "was blocked" : "passed"}. The drawer below lists every MCP, APIMatic, REST, Claude and Channel3 call.`;
    },
  },
];

interface Tour {
  running: boolean;
  step: number;
  total: number;
  title: string;
  caption: string;
  start: () => void;
  stop: () => void;
}

const TourContext = createContext<Tour | null>(null);
export const useTour = () => useContext(TourContext);

export function TourProvider({ setStage, children }: { setStage: (s: StageId) => void; children: ReactNode }) {
  const toast = useToast();
  const [running, setRunning] = useState(false);
  const [step, setStep] = useState(0);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const token = useRef(0);

  const stop = useCallback(() => {
    token.current += 1;
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    const mine = ++token.current;
    const alive = () => token.current === mine;
    setRunning(true);
    (async () => {
      for (let i = 0; i < STEPS.length; i++) {
        if (!alive()) return;
        const s = STEPS[i];
        setStep(i + 1);
        setTitle(s.title);
        setCaption("Working...");
        setStage(s.stage);
        const began = Date.now();
        try {
          const text = await s.run(await latest());
          if (alive()) setCaption(text);
        } catch (err) {
          if (alive()) setCaption(`This step could not complete (${err instanceof Error ? err.message : String(err)}). Continuing.`);
        }
        const rest = BEAT_MS - (Date.now() - began);
        if (rest > 0) await new Promise((r) => setTimeout(r, rest));
      }
      if (alive()) {
        setRunning(false);
        toast({ kind: "ok", text: "Judge tour complete. Every stage stays live: click anything to explore." });
      }
    })();
  }, [setStage, toast]);

  return <TourContext.Provider value={{ running, step, total: STEPS.length, title, caption, start, stop }}>{children}</TourContext.Provider>;
}

export function TourBanner() {
  const tour = useTour();
  if (!tour?.running) return null;
  return (
    <div className="tour-dock" role="status" aria-live="polite">
      <div className="tour-progress" aria-hidden>
        <span style={{ transform: `scaleX(${tour.step / tour.total})` }} />
      </div>
      <div className="tour-body">
        <span className="tour-step">/judge tour {tour.step} of {tour.total}</span>
        <span className="tour-text">
          <strong>{tour.title}</strong>
          <span className="tour-caption">{tour.caption}</span>
        </span>
        <button className="btn sm" onClick={tour.stop}>Stop</button>
      </div>
    </div>
  );
}
