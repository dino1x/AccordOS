import "./env.js";
import compression from "compression";
import express from "express";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aiMode, catalogMode, config, paypalMode } from "./config.js";
import { seed } from "./orchestrator.js";
import { api } from "./routes.js";

const app = express();
app.use(compression());
app.use(express.json({ limit: "2mb" }));
app.use("/api", api);

const webDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../web");
// Fingerprinted bundles never change, so phones and laptops cache them for a year.
app.use("/assets", express.static(path.join(webDir, "assets"), { maxAge: "1y", immutable: true }));
app.use(express.static(webDir, { maxAge: "1h", index: false }));
// Stages are hash routes, so only "/" is the app; any other path is a real 404.
// Link-preview tags need absolute URLs; when the build did not know the public origin,
// fill in the one this request arrived on (behind Render or another proxy, via X-Forwarded-*).
app.get("/", (req, res) => {
  const indexHtml = readFileSync(path.join(webDir, "index.html"), "utf8");
  const proto = String(req.headers["x-forwarded-proto"] ?? req.protocol).split(",")[0];
  const host = String(req.headers["x-forwarded-host"] ?? req.headers.host ?? "").split(",")[0];
  const origin = /^[\w.-]+(:\d+)?$/.test(host) ? `${proto === "https" ? "https" : "http"}://${host}` : "";
  res.set("Cache-Control", "no-cache").type("html").send(origin ? indexHtml.replace('content="/og.jpg"', `content="${origin}/og.jpg"`).replace('content="/"', `content="${origin}/"`) : indexHtml);
});
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
