import gsap from "gsap";
import { content } from "./content";
import { localToUtc } from "./astro";
import { Sky, MOON_RADIUS_PX, type StarData } from "./sky";
import { findRabbit, messageCount } from "./rabbit";
import { Fx } from "./fx";
import { Card } from "./card";
import { Finale } from "./finale";
import { sound } from "./audio";
import { starCaption } from "./constellations";
import { dateFr } from "./text";

const $ = (s: string) => document.querySelector(s) as HTMLElement;
const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const STORE = "ciel-vues";

export async function createApp() {
  const params = new URLSearchParams(location.search);
  const debug = params.has("debug");
  const lockQuality = params.get("q") === "high";
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const data: StarData = await (await fetch(import.meta.env.BASE_URL + "stars.json")).json();
  const nz = content.naissance;
  const date = localToUtc(nz.date, nz.heure, nz.fuseau);

  const canvas = $("#sky") as HTMLCanvasElement;
  const sky = new Sky(canvas, data, { date, lat: nz.lat, lon: nz.lon });
  if (reduced) sky.calm = 0.35;

  const total = messageCount(content.messages.length);
  if (total !== content.messages.length) {
    console.warn(`Le lapin accepte 8 à 12 messages (${content.messages.length} fournis).`);
  }
  const rabbit = findRabbit(sky, total);
  rabbit.stars.forEach((s) => sky.setState(s, 1));

  const fx = new Fx($("#fx") as HTMLCanvasElement, sky);
  fx.rabbit = rabbit;
  fx.resetLines();
  fx.debug = debug;
  fx.caption = content.ui.constellation;
  fx.reduced = reduced;
  fx.meteorsOn = false;

  const card = new Card(reduced);
  const focus = { t: 0 };
  let time = 0;
  const finale = new Finale({ sky, fx, rabbit, focus, reduced, now: () => time });

  let mode: "intro" | "sky" | "finale" = "intro";
  const seen: number[] = []; // dans l'ordre de découverte
  let lastFind = 0;

  // ── HUD ──────────────────────────────────────────────
  const progress = $("#progress");
  for (let i = 0; i < total; i++) progress.appendChild(document.createElement("i"));
  const dots = Array.from(progress.children) as HTMLElement[];
  const paintProgress = () => {
    dots.forEach((d, i) => d.classList.toggle("on", i < seen.length));
    progress.setAttribute("aria-label", `${seen.length} étoiles sur ${total}`);
  };
  paintProgress();
  $("#place").innerHTML = "";
  [nz.ville, dateFr(nz.date), nz.heure.replace(":", " h ")].forEach((t, i) => {
    if (i) {
      const sep = document.createElement("b");
      sep.textContent = "—";
      $("#place").appendChild(sep);
    }
    $("#place").appendChild(document.createTextNode(t));
  });
  $("#hint").textContent = content.ui.indice;
  $(".f-kicker").textContent = content.ui.joyeux;
  $(".f-name").textContent = content.prenom;
  $(".f-msg").textContent = content.messageFinal;
  $(".f-sign").textContent = content.signature;
  $("#again").textContent = content.ui.revoir;

  const soundBtn = $("#sound");
  soundBtn.addEventListener("click", () => {
    const on = !sound.enabled;
    sound.setEnabled(on);
    soundBtn.setAttribute("aria-pressed", String(on));
    soundBtn.setAttribute("aria-label", on ? "Couper le son" : "Activer le son");
  });

  // ── Étoiles du lapin ─────────────────────────────────
  const save = () => {
    try { sessionStorage.setItem(STORE, JSON.stringify(seen)); } catch { /* navigation privée */ }
  };

  function openStar(k: number) {
    const star = rabbit.stars[k];
    const isNew = !seen.includes(k);
    if (isNew) {
      seen.push(k);
      lastFind = time;
      sky.setState(star, 2);
      paintProgress();
      save();
    }
    $("#hint").classList.remove("on");
    fx.ring(sky.dir(star), time);
    sound.chime(seen.indexOf(k), 1);
    const caption = rabbit.real ? starCaption(data.c.slice(star * 3, star * 3 + 3), data.names[star]) : starCaption("");
    card.open(caption, content.messages[k] ?? "");
  }

  function openMoon() {
    fx.ring(sky.moon.dir, time, false);
    sound.chime(4, 0.7);
    $("#hint").classList.remove("on");
    card.open(`La Lune · éclairée à ${Math.round(sky.moon.fraction * 100)} %`, content.messageLune);
  }

  card.onClose = () => {
    if (mode === "sky" && seen.length === total) startFinale();
  };

  function startFinale() {
    if (mode !== "sky") return;
    mode = "finale";
    fx.meteorsOn = false;
    gsap.delayedCall(0.5, () => finale.play());
  }

  $("#again").addEventListener("click", () => {
    if (mode !== "finale") return;
    seen.length = 0;
    save();
    finale.reset(() => {
      mode = "sky";
      fx.meteorsOn = !reduced;
      lastFind = time;
      $("#hint").style.opacity = "";
      $("#hint").classList.add("on");
    });
    rabbit.stars.forEach((s) => sky.setState(s, 1));
    paintProgress();
  });

  // ── Toucher : glisser pour bouger un peu, taper pour ouvrir ──
  const panT = { x: 0, y: 0 }, panC = { x: 0, y: 0 };
  const PAN_X = 64, PAN_Y = 52;
  const rubber = (v: number, lim: number) => (Math.abs(v) <= lim ? v : Math.sign(v) * (lim + (Math.abs(v) - lim) * 0.28));
  let ptr: { id: number; x: number; y: number; px: number; py: number; moved: boolean; t: number } | null = null;

  canvas.addEventListener("pointerdown", (e) => {
    if (mode !== "sky") return;
    ptr = { id: e.pointerId, x: e.clientX, y: e.clientY, px: panT.x, py: panT.y, moved: false, t: performance.now() };
    try { canvas.setPointerCapture(e.pointerId); } catch { /* pointeur déjà relâché */ }
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!ptr || e.pointerId !== ptr.id) {
      // à la souris : légère parallaxe
      if (e.pointerType === "mouse" && !reduced) {
        tiltT.x = (e.clientX / sky.width - 0.5) * 5;
        tiltT.y = -(e.clientY / sky.height - 0.5) * 2.5;
      }
      return;
    }
    const dx = e.clientX - ptr.x, dy = e.clientY - ptr.y;
    if (!ptr.moved && Math.hypot(dx, dy) > 9) ptr.moved = true;
    if (ptr.moved && !card.isOpen) {
      panT.x = rubber(ptr.px + dx, PAN_X);
      panT.y = rubber(ptr.py + dy, PAN_Y);
    }
  });
  const release = (e: PointerEvent) => {
    if (!ptr || e.pointerId !== ptr.id) return;
    const p = ptr;
    ptr = null;
    panT.x = clamp(panT.x, -PAN_X, PAN_X);
    panT.y = clamp(panT.y, -PAN_Y, PAN_Y);
    if (e.type === "pointerup" && !p.moved && performance.now() - p.t < 700) tap(e.clientX, e.clientY);
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);

  function hitStar(x: number, y: number): number {
    let best = -1, bd = 38; // rayon de tap généreux (cible ≥ 44 pt)
    rabbit.stars.forEach((s, k) => {
      const p = sky.project(sky.dir(s));
      const d = Math.hypot(p.x - x, p.y - y);
      if (d < bd) { bd = d; best = k; }
    });
    return best;
  }

  function tap(x: number, y: number) {
    if (mode !== "sky") return;
    const k = hitStar(x, y);
    if (k >= 0) return openStar(k);
    if (sky.moonVisible && content.messageLune) {
      const m = sky.project(sky.moon.dir);
      if (Math.hypot(m.x - x, m.y - y) < MOON_RADIUS_PX + 24) return openMoon();
    }
    if (card.isOpen) card.close();
  }

  // ── Gyroscope ────────────────────────────────────────
  const tiltT = { x: 0, y: 0 }, tiltC = { x: 0, y: 0 };
  let base: { g: number; b: number } | null = null;
  function onOrientation(e: DeviceOrientationEvent) {
    if (e.gamma == null || e.beta == null) return;
    if (!base) base = { g: e.gamma, b: e.beta };
    // la position de repos suit lentement la façon dont elle tient le téléphone
    base.g += (e.gamma - base.g) * 0.004;
    base.b += (e.beta - base.b) * 0.004;
    tiltT.x = clamp((e.gamma - base.g) * 0.24, -7, 7);
    tiltT.y = clamp(-(e.beta - base.b) * 0.12, -3.5, 3.5);
  }

  // ── Boucle ───────────────────────────────────────────
  let raf = 0, last = 0, running = false;
  let fpsFrames = 0, fpsTime = 0, fpsShown = 0, warm = 0, level = 0;
  const dbg = $("#debug");

  function frame(now: number) {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, (now - last) / 1000 || 0.016);
    const rawDt = (now - last) / 1000;
    last = now;
    time += dt;

    const kp = 1 - Math.exp(-dt * 16), kt = 1 - Math.exp(-dt * 3.5);
    panC.x += (panT.x - panC.x) * kp;
    panC.y += (panT.y - panC.y) * kp;
    tiltC.x += (tiltT.x - tiltC.x) * kt;
    tiltC.y += (tiltT.y - tiltC.y) * kt;
    const free = 1 - focus.t;
    sky.tilt.x = tiltC.x * (0.35 + 0.65 * free);
    sky.tilt.y = tiltC.y * (0.35 + 0.65 * free);

    // cadrage du final : zoom + recentrage sur le lapin, sans tourner le ciel
    const zoomTo = focusZoom();
    sky.view.zoom = 1 + (zoomTo - 1) * focus.t;
    sky.updateView();
    const [px, py] = sky.plane(rabbit.center);
    const fy = focusY();
    sky.offset.x = panC.x * free + -px * sky.scale * focus.t;
    sky.offset.y = panC.y * free + (fy - sky.height / 2 + py * sky.scale) * focus.t;

    sky.render(time);
    fx.draw(time, dt);

    // un petit signe si elle cherche depuis longtemps
    if (mode === "sky" && !card.isOpen && seen.length < total && time - lastFind > 28) {
      lastFind = time;
      const k = rabbit.stars.findIndex((_, i) => !seen.includes(i));
      if (k >= 0) fx.ring(sky.dir(rabbit.stars[k]), time, false);
    }

    // mesure des fps ; on allège si l'appareil peine
    if (mode !== "intro" && rawDt < 0.25) {
      fpsFrames++;
      fpsTime += rawDt;
      if (fpsTime >= 1.5) {
        fpsShown = fpsFrames / fpsTime;
        fpsFrames = 0;
        fpsTime = 0;
        warm++;
        if (!lockQuality && warm > 2 && fpsShown < 46 && level < 3) {
          level++;
          warm = 0;
          if (level === 1) sky.bloomOn = false;
          if (level === 2) { sky.setMaxPixelRatio(1.5); }
          if (level === 3) { sky.setMaxPixelRatio(1); }
        }
        if (debug) dbgText.textContent = `${fpsShown.toFixed(0)} fps · niveau ${level} · bloom ${sky.bloomOn ? "oui" : "non"} · lapin ${rabbit.real ? "réel" : "inventé"} (écart ${(rabbit.deviation * 100).toFixed(0)} %)`;
      }
    }
  }

  // rayon du lapin dans le plan, pour le cadrage du final
  let planeRadius = 0.4;
  {
    sky.updateView();
    const [cx, cy] = sky.plane(rabbit.center);
    planeRadius = Math.max(...rabbit.stars.map((s) => {
      const [x, y] = sky.plane(sky.dir(s));
      return Math.hypot(x - cx, y - cy);
    }));
  }
  function focusZoom() {
    const s0 = sky.scale / sky.view.zoom;
    const portrait = sky.height > sky.width * 1.25;
    const want = portrait ? Math.min(sky.width * 0.37, sky.height * 0.215) : sky.height * 0.17;
    return clamp(want / (planeRadius * s0), 0.9, 2.4);
  }
  function focusY() {
    return sky.height * (sky.height > sky.width * 1.25 ? 0.3 : 0.25);
  }

  function run() {
    if (running) return;
    running = true;
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function halt() {
    running = false;
    cancelAnimationFrame(raf);
  }

  // retour d'arrière-plan : pause et reprise propres
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      halt();
      sound.pause();
      gsap.globalTimeline.pause();
    } else {
      gsap.globalTimeline.resume();
      sound.resume();
      run();
    }
  });

  // perte du contexte WebGL (fréquente sur iOS quand la mémoire manque)
  let lostTimer = 0;
  canvas.addEventListener("webglcontextlost", (e) => {
    e.preventDefault();
    halt();
    lostTimer = window.setTimeout(() => location.reload(), 4000);
  });
  canvas.addEventListener("webglcontextrestored", () => {
    window.clearTimeout(lostTimer);
    sky.resize();
    run();
  });

  const onResize = () => {
    sky.resize();
    fx.resize();
  };
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", () => setTimeout(onResize, 250));

  // ── Debug (?debug) ───────────────────────────────────
  const dbgText = document.createElement("div");
  if (debug) {
    dbg.hidden = false;
    dbg.appendChild(dbgText);
    for (let i = 0; i < sky.n && sky.mags[i] < 1.7; i++) {
      if (data.names[i]) fx.labels.push({ dir: sky.dir(i), text: data.names[i] });
    }
    const all = document.createElement("button");
    all.textContent = "Tout débloquer";
    all.addEventListener("click", () => {
      if (mode !== "sky") return;
      card.close(true);
      rabbit.stars.forEach((s, k) => {
        if (!seen.includes(k)) seen.push(k);
        sky.setState(s, 2);
      });
      paintProgress();
      startFinale();
    });
    dbg.appendChild(all);
    (window as any).__ciel = { sky, fx, rabbit, seen, focus, frame, get mode() { return mode; }, get time() { return time; } };
  }

  // quelques images dès maintenant : les shaders sont compilés avant le premier tap
  run();

  return {
    start(gyro: boolean) {
      if (mode !== "intro") return;
      mode = "sky";
      lastFind = 0;
      time = Math.max(time, 0);
      if (gyro && !reduced) window.addEventListener("deviceorientation", onOrientation);
      $("#hud").classList.remove("is-hidden");
      sound.startPad();
      gsap.to(sky, { reveal: 1, duration: reduced ? 1.5 : 6, ease: "power1.inOut" });
      // reprise d'une visite interrompue (rechargement, perte de contexte)
      try {
        const old = JSON.parse(sessionStorage.getItem(STORE) || "[]") as number[];
        for (const k of old) {
          if (Number.isInteger(k) && k >= 0 && k < total && !seen.includes(k)) {
            seen.push(k);
            sky.setState(rabbit.stars[k], 2);
          }
        }
        paintProgress();
      } catch { /* rien à reprendre */ }
      gsap.delayedCall(reduced ? 1.5 : 4.5, () => {
        lastFind = time;
        fx.meteorsOn = !reduced;
        if (seen.length === 0) $("#hint").classList.add("on");
        if (seen.length === total) startFinale();
      });
    },
  };
}
