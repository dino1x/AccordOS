// Bryntum Scheduler bound to the payment-gated plan. Resources are crews,
// the carrier, the procurement desk, the client and treasury; events are the
// planner's tasks; dependencies come straight from the task graph. Every
// PayPal webhook or carrier event recomputes the plan server-side and this
// view re-renders with the shifted bookings.
import "@bryntum/scheduler/scheduler.css";
import stockholmLight from "@bryntum/scheduler/stockholm-light.css?inline";
import stockholmDark from "@bryntum/scheduler/stockholm-dark.css?inline";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import type { EventModelConfig } from "@bryntum/scheduler";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import { useEffect, useMemo } from "react";
import type { Task } from "../../../server/src/types";

const DAY = 86400000;

// Bryntum themes set root-level variables, so the light and dark sheets are swapped
// to follow the app theme instead of being overridden locally.
function useBryntumTheme() {
  useEffect(() => {
    const el = document.createElement("style");
    el.id = "bryntum-theme";
    document.head.appendChild(el);
    const apply = () => (el.textContent = document.documentElement.dataset.theme === "dark" ? stockholmDark : stockholmLight);
    apply();
    const watch = new MutationObserver(apply);
    watch.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => {
      watch.disconnect();
      el.remove();
    };
  }, []);
}

export function BryntumSchedulerView({ tasks, dayZero, moved }: { tasks: Task[]; dayZero: string; moved: Set<string> }) {
  useBryntumTheme();
  const origin = useMemo(() => new Date(`${dayZero}T00:00:00`), [dayZero]);
  const end = Math.max(...tasks.map((t) => t.start + t.duration)) + 3;

  const resources = useMemo(
    () =>
      [...new Set(tasks.map((t) => t.resource))].map((name) => ({
        id: name,
        name,
        bookedDays: tasks.filter((t) => t.resource === name).reduce((s, t) => s + t.duration, 0),
      })),
    [tasks],
  );

  const events = useMemo(
    () =>
      tasks.map((t) => ({
        id: t.id,
        resourceId: t.resource,
        name: t.name,
        startDate: new Date(origin.getTime() + t.start * DAY),
        endDate: new Date(origin.getTime() + (t.start + t.duration) * DAY),
        eventColor: (t.status === "blocked" ? "red" : t.critical ? "orange" : "teal") as EventModelConfig["eventColor"],
        eventStyle: (t.status === "blocked" ? "bordered" : "tonal") as EventModelConfig["eventStyle"],
        cls: moved.has(t.id) ? "accord-moved" : "",
        gate: t.gate ? `${t.gate.satisfied ? "Cleared" : "Waiting"}: ${t.gate.label}` : "",
      })) as EventModelConfig[],
    [tasks, origin, moved],
  );

  const dependencies = useMemo(() => tasks.flatMap((t) => t.deps.map((d) => ({ id: `${d}->${t.id}`, from: d, to: t.id }))), [tasks]);

  return (
    <div className="bryntum-host" style={{ height: 380 }}>
      <BryntumScheduler
        readOnly
        startDate={origin}
        endDate={new Date(origin.getTime() + end * DAY)}
        viewPreset={{ base: "weekAndDayLetter", tickWidth: 30 }}
        rowHeight={44}
        barMargin={8}
        resources={resources}
        events={events}
        dependencies={dependencies}
        dependenciesFeature
        eventTooltipFeature={{ template: ({ eventRecord }: { eventRecord: { name: string; get: (k: string) => string } }) => `<b>${eventRecord.name}</b><br>${eventRecord.get("gate") || "No payment gate"}` }}
        columns={[
          { text: "Resource", field: "name", width: 150 },
          { text: "Booked", field: "bookedDays", width: 80, align: "right", renderer: ({ value }: { value: number }) => `${value} d` },
        ]}
      />
    </div>
  );
}
