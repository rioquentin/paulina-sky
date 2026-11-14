import "@fontsource/cormorant-garamond/latin-300.css";
import "@fontsource/cormorant-garamond/latin-300-italic.css";
import "@fontsource/cormorant-garamond/latin-400.css";
import "@fontsource/cormorant-garamond/latin-500.css";
import "./style.css";
import { content } from "./content";
import { sound } from "./audio";
import { auDessusDe, dateFr } from "./text";

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const intro = $("#intro");
const startBtn = $("#start");

// ── Intro : affichée tout de suite, avant le chargement du ciel ──
const line = $("#intro-line");
for (const t of [`Le ciel du ${dateFr(content.naissance.date)},`, `${auDessusDe(content.naissance.ville)}.`]) {
  const s = document.createElement("span");
  s.textContent = t;
  line.appendChild(s);
}
(startBtn.firstElementChild as HTMLElement).textContent = content.ui.commencer;
($("#rotate p") as HTMLElement).textContent = content.ui.paysage;

// quelques étoiles qui scintillent déjà
const starsEl = $(".intro-stars");
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
for (let i = 0; i < 46; i++) {
  const s = document.createElement("i");
  const size = rnd() < 0.14 ? 2.4 : 1 + rnd() * 0.9;
  s.style.cssText = `left:${(rnd() * 100).toFixed(2)}%;top:${(rnd() * 100).toFixed(2)}%;--s:${size.toFixed(1)}px;--o:${(0.35 + rnd() * 0.6).toFixed(2)};--d:${(2.6 + rnd() * 3.4).toFixed(1)}s;--w:${(-rnd() * 6).toFixed(1)}s`;
  starsEl.appendChild(s);
}

// le texte attend sa police (sans jamais bloquer plus d'une seconde)
const fonts = (document as any).fonts;
Promise.race([
  fonts ? Promise.all([fonts.load('italic 300 30px "Cormorant Garamond"'), fonts.load('500 12px "Cormorant Garamond"')]) : Promise.resolve(),
  new Promise((r) => setTimeout(r, 1000)),
]).then(() => requestAnimationFrame(() => intro.classList.add("is-ready")));

// ── Le ciel se charge pendant qu'elle lit ──
const appReady = import("./app").then((m) => m.createApp());
appReady.catch((e) => console.error("Chargement du ciel impossible :", e));

async function askGyro(): Promise<boolean> {
  const D = (window as any).DeviceOrientationEvent;
  if (!D) return false;
  if (typeof D.requestPermission === "function") {
    try {
      return (await D.requestPermission()) === "granted";
    } catch {
      return false;
    }
  }
  return true;
}

let started = false;
startBtn.addEventListener("click", async () => {
  if (started) return;
  started = true;
  // dans le geste : déblocage de l'audio iOS et permission du gyroscope
  sound.unlock();
  const gyroAsked = askGyro();
  startBtn.classList.add("is-waiting");
  try {
    const [app, gyro] = await Promise.all([appReady, gyroAsked]);
    intro.classList.add("is-leaving");
    app.start(gyro);
  } catch {
    started = false;
    startBtn.classList.remove("is-waiting");
    location.reload();
  }
});

// pas de zoom au pincement ni au double-tap, pas de menu contextuel
for (const ev of ["gesturestart", "gesturechange", "dblclick", "contextmenu"]) {
  document.addEventListener(ev, (e) => e.preventDefault(), { passive: false });
}
document.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
