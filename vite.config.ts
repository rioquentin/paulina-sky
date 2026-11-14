import { defineConfig, type Plugin } from "vite";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";

// Dev uniquement : /og.html dessine l'aperçu et l'icône, puis les dépose dans public/.
const ALLOWED = new Set(["og.jpg", "apple-touch-icon.png", "icon-64.png"]);
function saveImages(): Plugin {
  return {
    name: "save-images",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/__save", (req, res) => {
        const name = new URL(req.url ?? "", "http://x").searchParams.get("name") ?? "";
        if (req.method !== "POST" || !ALLOWED.has(name)) {
          res.statusCode = 400;
          res.end("refus");
          return;
        }
        const chunks: Buffer[] = [];
        req.on("data", (c) => chunks.push(c));
        req.on("end", async () => {
          await writeFile(resolve(server.config.root, "public", name), Buffer.concat(chunks));
          res.end("ok");
        });
      });
    },
  };
}

// Les aperçus de lien (iMessage, WhatsApp) exigent une URL absolue pour og:image.
// Sur Vercel, l'adresse de production est fournie au build ; sinon définir SITE_URL.
function absoluteOg(): Plugin {
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  let base = process.env.SITE_URL || (vercel ? "https://" + vercel : "");
  if (base.endsWith("/")) base = base.slice(0, -1);
  return {
    name: "absolute-og",
    transformIndexHtml(html) {
      let out = html.replace('content="/og.jpg"', `content="${base}/og.jpg"`);
      if (base) out = out.replace("</title>", `</title>\n    <meta property="og:url" content="${base}/" />`);
      return out;
    },
  };
}

export default defineConfig({
  plugins: [saveImages(), absoluteOg()],
  build: { target: "es2020", chunkSizeWarningLimit: 900 },
});
