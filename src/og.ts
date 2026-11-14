// Page de dev : dessine l'image d'aperçu (og.jpg) et l'icône avec le vrai ciel de la nuit.
// /og.html -> 1200×630 ; /og.html?icon -> 180×180. Capturées par `npm run og`.
import "@fontsource/cormorant-garamond/latin-300-italic.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import { content } from "./content";
import { bvToRgb, fromAltAz, horizontal, localSiderealDeg, localToUtc, moonState } from "./astro";


const STAR = "M12 1.5c.5 6.2 2.3 9 9 10.5-6.7 1.5-8.5 4.3-9 10.5-.5-6.2-2.3-9-9-10.5 6.700-1.500 8.500-4.300 9-10.500z";
const log = document.getElementById("log")!;

async function render(icon: boolean, W: number, H: number, name: string, type: string) {
  const R = 2;
  const canvas = document.createElement("canvas");
  canvas.width = W * R;
  canvas.height = H * R;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(R, R);

  const g = ctx.createRadialGradient(W / 2, H * 1.25, 0, W / 2, H * 1.25, H * 1.5);
  g.addColorStop(0, "#2c1b4d");
  g.addColorStop(0.4, "#171238");
  g.addColorStop(0.75, "#0a0e27");
  g.addColorStop(1, "#060918");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const nz = content.naissance;
  const date = localToUtc(nz.date, nz.heure, nz.fuseau);
  const lst = localSiderealDeg(date, nz.lon);
  const moon = moonState(date, nz.lat, nz.lon, lst);
  const moonAz = (Math.atan2(moon.dir[0], moon.dir[1]) * 180) / Math.PI;
  const F = fromAltAz(36, moon.altitudeDeg > 10 ? moonAz + 46 : 180);
  const Rv = [F[1], -F[0], 0];
  const rl = Math.hypot(Rv[0], Rv[1]);
  Rv[0] /= rl; Rv[1] /= rl;
  const U = [Rv[1] * F[2] - Rv[2] * F[1], Rv[2] * F[0] - Rv[0] * F[2], Rv[0] * F[1] - Rv[1] * F[0]];
  const S = icon ? W * 0.85 : 560;
  const project = (d: number[]) => {
    const x = d[0] * Rv[0] + d[1] * Rv[1] + d[2] * Rv[2];
    const y = d[0] * U[0] + d[1] * U[1] + d[2] * U[2];
    const z = d[0] * F[0] + d[1] * F[1] + d[2] * F[2];
    const k = 2 / (1 + z);
    return { x: W / 2 + x * k * S, y: H / 2 - y * k * S, ok: z > -0.3 };
  };

  ctx.globalCompositeOperation = "lighter";
  for (let i = 0; i < data.n; i++) {
    const mag = data.d[i * 4 + 2] / 100;
    if (icon && mag > 4.2) continue;
    const d = horizontal(data.d[i * 4] / 100, data.d[i * 4 + 1] / 100, lst, nz.lat);
    const p = project(d);
    if (!p.ok || p.x < -20 || p.x > W + 20 || p.y < -20 || p.y > H + 20) continue;
    const b = Math.pow(10, -0.4 * mag);
    const r = (0.5 + 2.4 * Math.pow(b, 0.42)) * (icon ? 0.8 : 1.45);
    const a = Math.max(0.2, Math.min(1, 1.3 - 0.19 * mag));
    const [cr, cg, cb] = bvToRgb(data.d[i * 4 + 3] / 100).map((v) => Math.round(v * 255));
    const gr = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3.2);
    gr.addColorStop(0, `rgba(${cr},${cg},${cb},${a})`);
    gr.addColorStop(0.3, `rgba(${cr},${cg},${cb},${a * 0.35})`);
    gr.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = gr;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r * 3.2, 0, 6.283);
    ctx.fill();
  }

  if (!icon && moon.altitudeDeg > 6) {
    const p = project(moon.dir);
    const halo = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 190);
    halo.addColorStop(0, "rgba(170,190,255,0.34)");
    halo.addColorStop(0.3, "rgba(150,170,245,0.10)");
    halo.addColorStop(1, "rgba(150,170,245,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(p.x, p.y, 190, 0, 6.283); ctx.fill();
    ctx.globalCompositeOperation = "source-over";
    const disc = ctx.createRadialGradient(p.x - 5, p.y - 5, 2, p.x, p.y, 27);
    disc.addColorStop(0, "#fffdf4");
    disc.addColorStop(0.8, "#f6f1e3");
    disc.addColorStop(1, "#e2dccb");
    ctx.fillStyle = disc;
    ctx.beginPath(); ctx.arc(p.x, p.y, 26, 0, 6.283); ctx.fill();
    ctx.fillStyle = "rgba(150,146,150,0.10)";
    for (const [dx, dy, r] of [[-8, -6, 8], [5, -9, 6], [8, 6, 7], [-5, 9, 5]]) {
      ctx.beginPath(); ctx.arc(p.x + dx, p.y + dy, r, 0, 6.283); ctx.fill();
    }
  }


  ctx.globalCompositeOperation = "source-over";
  const star = new Path2D(STAR);
  if (icon) {
    const k = W / 44;
    ctx.save();
    ctx.translate(W / 2 - 12 * k, H / 2 - 12 * k);
    ctx.scale(k, k);
    ctx.shadowColor = "rgba(255, 220, 170, 0.85)";
    ctx.shadowBlur = W * 0.16;
    ctx.fillStyle = "#ffdcaa";
    ctx.fill(star);
    ctx.restore();
  } else {
    // voile sombre derrière le titre, pour la lisibilité
    const veil = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, 540);
    veil.addColorStop(0, "rgba(7,9,28,0.66)");
    veil.addColorStop(1, "rgba(7,9,28,0)");
    ctx.fillStyle = veil;
    ctx.fillRect(0, 0, W, H);
    ctx.save();
    ctx.translate(W / 2 - 20, 196);
    ctx.scale(40 / 24, 40 / 24);
    ctx.fillStyle = "#ffdcaa";
    ctx.fill(star);
    ctx.restore();
    ctx.textAlign = "center";
    ctx.textBaseline = "alphabetic";
    ctx.shadowColor = "rgba(170, 190, 255, 0.5)";
    ctx.shadowBlur = 44;
    ctx.fillStyle = "#f1f2ff";
    ctx.font = 'italic 300 94px "Cormorant Garamond"';
    ctx.fillText("Un ciel rien que pour toi", W / 2, 356);
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(238, 240, 255, 0.62)";
    ctx.font = '500 21px "Cormorant Garamond"';
    (ctx as any).letterSpacing = "9px";
    ctx.fillText("À OUVRIR QUAND IL FAIT NUIT", W / 2 + 4, 432);
  }

  // réduction propre à la taille finale
  const final = document.createElement("canvas");
  final.width = W;
  final.height = H;
  const fc = final.getContext("2d")!;
  fc.imageSmoothingQuality = "high";
  fc.drawImage(canvas, 0, 0, W, H);
  document.body.appendChild(final);
  const blob: Blob = await new Promise((r) => final.toBlob((b) => r(b!), type, 0.9));
  const res = await fetch("/__save?name=" + name, { method: "POST", body: blob });
  log.textContent += ` ${name} (${(blob.size / 1024).toFixed(0)} Ko) ${res.ok ? "✓" : "✗"}`;
}

const fonts = (document as any).fonts;
await Promise.all([fonts.load('italic 300 94px "Cormorant Garamond"'), fonts.load('500 21px "Cormorant Garamond"')]);
const data = await (await fetch("/stars.json")).json();
await render(false, 1200, 630, "og.jpg", "image/jpeg");
await render(true, 180, 180, "apple-touch-icon.png", "image/png");
await render(true, 64, 64, "icon-64.png", "image/png");
document.body.dataset.ready = "1";
