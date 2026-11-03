import { lazy, StrictMode, Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Header, StageNav, StatusStrip, STAGES, TelemetryDrawer, type StageId } from "./components/Shell";
import { TourBanner, TourProvider } from "./components/JudgeTour";
import { Skeleton, ToastHost } from "./components/ui";
import { DeskContext, useDeskSource } from "./lib/api";
import { TrancheStage } from "./stages/TrancheStage";
import "./styles.css";

// Later stages load on first visit, and are fetched in the background once the page is idle.
const loaders = {
  bakeoff: () => import("./stages/BakeOffStage").then((m) => ({ default: m.BakeOffStage })),
  schedule: () => import("./stages/ScheduleStage").then((m) => ({ default: m.ScheduleStage })),
  ledger: () => import("./stages/LedgerStage").then((m) => ({ default: m.LedgerStage })),
  redteam: () => import("./stages/RedTeamStage").then((m) => ({ default: m.RedTeamStage })),
};
const BakeOffStage = lazy(loaders.bakeoff);
const ScheduleStage = lazy(loaders.schedule);
const LedgerStage = lazy(loaders.ledger);
const RedTeamStage = lazy(loaders.redteam);
const prefetch = () => Object.values(loaders).forEach((load) => void load());
if ("requestIdleCallback" in window) requestIdleCallback(prefetch, { timeout: 4000 });
else setTimeout(prefetch, 2500);

function initialStage(): StageId {
  const hash = location.hash.slice(1);
  if (STAGES.some((s) => s.id === hash)) return hash as StageId;
  try {
    const saved = localStorage.getItem("accordos.stage");
    if (saved && STAGES.some((s) => s.id === saved)) return saved as StageId;
  } catch {
    // storage unavailable: start at stage 01
  }
  return "tranche";
}

function App() {
  const desk = useDeskSource();
  const [stage, setStage] = useState<StageId>(initialStage);
  useEffect(() => {
    const onHash = () => {
      const h = location.hash.slice(1);
      if (STAGES.some((s) => s.id === h)) setStage(h as StageId);
    };
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);
  useEffect(() => {
    history.replaceState(null, "", `#${stage}`);
    window.scrollTo({ top: 0 });
    try {
      localStorage.setItem("accordos.stage", stage);
    } catch {
      // ignore
    }
  }, [stage]);

  return (
    <DeskContext.Provider value={desk}>
      <ToastHost>
        <TourProvider setStage={setStage}>
        <div className="app">
          <StatusStrip />
          <Header />
          <main className="stage" id="main">
            <div className="wrap">
              <StageNav current={stage} onSelect={setStage} />
              {stage === "tranche" && <TrancheStage />}
              <Suspense fallback={<div className="stage-head"><Skeleton lines={3} /></div>}>
                {stage === "bakeoff" && <BakeOffStage />}
                {stage === "schedule" && <ScheduleStage />}
                {stage === "ledger" && <LedgerStage />}
                {stage === "redteam" && <RedTeamStage />}
              </Suspense>
            </div>
          </main>
          <TourBanner />
          <TelemetryDrawer />
        </div>
        </TourProvider>
      </ToastHost>
    </DeskContext.Provider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
