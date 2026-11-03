import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

// Link previews (Open Graph, X cards) need absolute URLs. The public origin comes from
// PUBLIC_URL, else the host's own build-time variable on Vercel or Render. Without one,
// the tags stay relative and the Node server fills in the request origin at runtime.
function publicOrigin(): string | null {
  const raw = process.env.PUBLIC_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL && `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`) || process.env.RENDER_EXTERNAL_URL;
  return raw ? raw.replace(/\/+$/, "") : null;
}

const absoluteSocialTags = (): Plugin => ({
  name: "absolute-social-tags",
  apply: "build",
  transformIndexHtml(html) {
    const origin = publicOrigin();
    return origin ? html.replace('content="/og.jpg"', `content="${origin}/og.jpg"`).replace('content="/"', `content="${origin}/"`) : html;
  },
});

export default defineConfig({
  root: "web",
  plugins: [react(), absoluteSocialTags()],
  build: { outDir: "../dist/web", emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 2000 },
  server: { port: 5173, proxy: { "/api": "http://localhost:8787" } },
});
