import "./env.js";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiMode, catalogMode, config, paypalMode } from "./config.js";
import { seed } from "./orchestrator.js";
import { api } from "./routes.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use("/api", api);

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
app.use(express.static(webDir, { maxAge: "1h", index: false }));
// Stages are hash routes, so only "/" is the app; any other path is a real 404.
app.get("/", (_req, res) => res.sendFile(path.join(webDir, "index.html")));
app.use((req, res) => {
  if (req.path.startsWith("/api")) res.status(404).json({ error: `No route ${req.method} ${req.path}` });
  else res.status(404).sendFile(path.join(webDir, "404.html"));
});

if (!process.env.VERCEL) {
  app.listen(config.port, () => {
    console.log(`AccordOS listening on :${config.port}  paypal=${paypalMode} ai=${aiMode} catalog=${catalogMode}`);
    seed().then(() => console.log("Seed scenario ready"));
  });
}

export default app;
