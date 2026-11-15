// Calque 2D au-dessus du ciel : anneaux de tap, étoiles filantes,
// traits de la constellation, illustration du lapin, cœurs.
import type { Sky } from "./sky";
import type { Rabbit } from "./rabbit";
import type { Vec3 } from "./astro";
import { apply, buildParts, placeOn, toIcon, EYE, GROUND, HEART, type Part } from "./figure";

interface Ring { dir: Vec3; t0: number; warm: boolean }
interface Meteor { x0: number; y0: number; ux: number; uy: number; dist: number; t0: number; life: number; len: number; w: number; big: boolean }
interface Mote { x: number; y: number; vx: number; vy: number; phase: number; sp: number; r: number }
interface Burst { x: number; y: number; t0: number }
interface Heart { x: number; y: number; vy: number; sway: number; phase: number; size: number; t0: number; life: number; rot: number }
interface Spark { x: number; y: number; vx: number; vy: number; t0: number; life: number; r: number }

const WARM = "255, 232, 196";
const PINK = "255, 150, 204"; // rose pastel des étoiles à toucher
const TAU = Math.PI * 2;

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private ratio = 1;
  private rings: Ring[] = [];
  private meteors: Meteor[] = [];
  private hearts: Heart[] = [];
  private sparks: Spark[] = [];
  private nextMeteor = 6;
  private motes: Mote[] = [];
  private bursts: Burst[] = [];
  private lastTrail = { x: -99, y: -99 };
  private force = false;
  /** Appelé au départ de chaque étoile filante (pour le son). */
  onMeteor: ((big: boolean) => void) | null = null;
  private parts: Part[] | null = null;
  private anchors: [number, number][] = [];
  private sx = new Float32Array(512);
  private sy = new Float32Array(512);
  private tmp = new Float32Array(2);
  private M = new Float32Array(6);
  private rx = new Float32Array(16);
  private ry = new Float32Array(16);

  rabbit: Rabbit | null = null;
  /** Avancement de chaque trait de la constellation (0..1). */
  seg: number[] = [];
  /** Opacité générale (constellation + illustration). */
  linesAlpha = 0;
  /** Opacité des traits droits, une fois l'illustration apparue. */
  skeleton = 1;
  /** Avancement du tracé de l'illustration (0..1). */
  art = 0;
  /** Lumière intérieure et pelage d'étoiles (0..1). */
  artFill = 0;
  flash = 0;
  /** Vie du lapin. */
  breathe = 0;
  earG = 0;
  blink = 0;
  tailWag = 0;
  /** Petit bond (0..1). */
  hop = 0;

  caption = "";
  /** L'étoile à toucher : elle brille très fort et appelle le doigt. */
  target: Vec3 | null = null;
  /** Les étoiles déjà vues : elles gardent un halo rose. */
  lit: Vec3[] = [];
  targetSince = 0;
  /** Affiche la forme du lapin en debug (?debug=lapin). */
  debugShape = false;
  private flights: { a: Vec3; b: Vec3; t0: number; dur: number; done: () => void }[] = [];
  debug = false;
  labels: { dir: Vec3; text: string }[] = [];
  meteorsOn = true;
  reduced = false;

  constructor(private canvas: HTMLCanvasElement, private sky: Sky) {
    this.ctx = canvas.getContext("2d")!;
    this.resize();
  }

  resize() {
    this.ratio = Math.min(Math.max(window.devicePixelRatio || 1, 2), 2);
    this.canvas.width = Math.round(this.sky.width * this.ratio);
    this.canvas.height = Math.round(this.sky.height * this.ratio);
  }

  ring(dir: Vec3, time: number, warm = true) {
    this.rings.push({ dir, t0: time, warm });
  }

  resetLines() {
    if (this.rabbit && !this.parts) {
      this.parts = buildParts();
      this.anchors = this.rabbit.anchors.map(toIcon);
    }
    this.seg = this.rabbit ? this.rabbit.segments.map(() => 0) : [];
    this.linesAlpha = 0;
    this.skeleton = 1;
    this.art = 0;
    this.artFill = 0;
    this.flash = 0;
    this.breathe = 0;
    this.earG = this.blink = this.tailWag = this.hop = 0;
    this.hearts.length = 0;
    this.sparks.length = 0;
  }

  /** Fait passer une grande étoile filante tout de suite. */
  shoot() {
    this.force = true;
  }

  /** Quelques étincelles sous le doigt quand on fait glisser le ciel. */
  trail(x: number, y: number, time: number) {
    if (this.reduced) return;
    if (Math.hypot(x - this.lastTrail.x, y - this.lastTrail.y) < 7) return;
    this.lastTrail = { x, y };
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * TAU, v = 4 + Math.random() * 16;
      this.sparks.push({ x: x + (Math.random() - 0.5) * 10, y: y + (Math.random() - 0.5) * 10, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 6, t0: time, life: 0.6 + Math.random() * 0.9, r: 0.5 + Math.random() * 0.9 });
    }
  }

  /** Un petit scintillement là où l'on touche le ciel vide. */
  twinkle(x: number, y: number, time: number) {
    this.bursts.push({ x, y, t0: time });
    if (this.reduced) return;
    for (let i = 0; i < 6; i++) {
      const a = Math.random() * TAU, v = 14 + Math.random() * 30;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, t0: time, life: 0.4 + Math.random() * 0.7, r: 0.5 + Math.random() * 0.7 });
    }
  }

  /** Une lumière file d'une étoile à la suivante, puis l'allume. */
  fly(a: Vec3, b: Vec3, time: number, done: () => void) {
    if (this.reduced) return done();
    this.flights.push({ a, b, t0: time, dur: 0.95, done });
  }

  private drawBeacon(time: number) {
    const { ctx, sky } = this;
    // halo rose des étoiles déjà vues (il s'efface quand le lapin se dessine)
    const keep = 1 - 0.7 * this.art;
    for (const d of this.lit) {
      const q = sky.project(d);
      const g0 = ctx.createRadialGradient(q.x, q.y, 0, q.x, q.y, 20);
      g0.addColorStop(0, `rgba(${PINK}, ${0.42 * keep})`);
      g0.addColorStop(0.45, `rgba(${PINK}, ${0.13 * keep})`);
      g0.addColorStop(1, `rgba(${PINK}, 0)`);
      ctx.fillStyle = g0;
      ctx.beginPath(); ctx.arc(q.x, q.y, 20, 0, TAU); ctx.fill();
    }
    if (!this.target) return;
    const p = sky.project(this.target);
    const age = time - this.targetSince;
    const appear = Math.min(1, age / 0.9);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.3);
    // halo
    const R = 62 + 18 * pulse;
    const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, R);
    g.addColorStop(0, `rgba(255, 186, 220, ${0.62 * appear * (0.75 + 0.25 * pulse)})`);
    g.addColorStop(0.3, `rgba(${PINK}, ${0.3 * appear})`);
    g.addColorStop(0.65, `rgba(${PINK}, ${0.09 * appear})`);
    g.addColorStop(1, `rgba(${PINK}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(p.x, p.y, R, 0, TAU); ctx.fill();
    // grands rayons en croix, petits rayons en diagonale
    for (let k = 0; k < 8; k++) {
      const ang = (k / 8) * TAU;
      const len = (k % 2 ? 22 : 56) + (k % 2 ? 6 : 20) * pulse;
      const ex = p.x + Math.cos(ang) * len * appear, ey = p.y + Math.sin(ang) * len * appear;
      const lg = ctx.createLinearGradient(p.x, p.y, ex, ey);
      lg.addColorStop(0, `rgba(255, 228, 240, ${0.85 * appear})`);
      lg.addColorStop(1, "rgba(255, 228, 240, 0)");
      ctx.strokeStyle = lg;
      ctx.lineWidth = k % 2 ? 1 : 1.6;
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(ex, ey); ctx.stroke();
    }
    // une onde douce qui s'élargit, comme un appel
    if (!this.reduced) {
      const ph = (age % 2.6) / 2.6;
      ctx.strokeStyle = `rgba(${PINK}, ${0.65 * (1 - ph) * (1 - ph) * appear})`;
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(p.x, p.y, 10 + ph * 58, 0, TAU); ctx.stroke();
    }
  }

  private drawFlights(time: number, dt: number) {
    const { sky } = this;
    for (const fl of this.flights.slice()) {
      const t = (time - fl.t0) / fl.dur;
      if (t >= 1) {
        this.flights.splice(this.flights.indexOf(fl), 1);
        fl.done();
        continue;
      }
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const a = sky.project(fl.a), b = sky.project(fl.b);
      const dx = b.x - a.x, dy = b.y - a.y;
      const bow = Math.sin(Math.PI * e) * 0.16;
      this.glint(a.x + dx * e - dy * bow, a.y + dy * e + dx * bow, 12, 1, time, dt, 3);
    }
  }

  /** Fait naître un cœur près du lapin. */
  heart(time: number) {
    if (!this.rabbit) return;
    const c = this.sky.project(this.rabbit.center);
    const r = this.rabbitRadiusPx();
    const a = Math.random() * TAU;
    const k = 0.45 + Math.random() * 0.7;
    this.hearts.push({
      x: c.x + Math.cos(a) * r * k,
      y: c.y + Math.sin(a) * r * k * 0.75 + r * 0.2,
      vy: 11 + Math.random() * 13,
      sway: 4 + Math.random() * 8,
      phase: Math.random() * TAU,
      size: 4.5 + Math.random() * 4.5,
      t0: time,
      life: 4.6 + Math.random() * 2.6,
      rot: (Math.random() - 0.5) * 0.5,
    });
  }

  private rabbitRadiusPx() {
    if (!this.rabbit) return 100;
    const c = this.sky.project(this.rabbit.center);
    let r = 0;
    for (const i of this.rabbit.stars) {
      const p = this.sky.project(this.sky.dir(i));
      r = Math.max(r, Math.hypot(p.x - c.x, p.y - c.y));
    }
    return r;
  }

  draw(time: number, dt: number) {
    const { ctx, sky } = this;
    const w = sky.width, h = sky.height;
    ctx.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = "lighter";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    this.drawMeteors(time, dt, w, h);
    this.drawRabbit(time, dt);
    this.drawBeacon(time);
    this.drawFlights(time, dt);
    this.drawRings(time);
    this.drawHearts(time, dt);

    if (this.debug) {
      ctx.globalCompositeOperation = "source-over";
      ctx.font = "10px ui-monospace, monospace";
      ctx.fillStyle = "rgba(160,200,255,0.75)";
      for (const l of this.labels) {
        const p = sky.project(l.dir);
        if (p.visible) ctx.fillText(l.text, p.x + 6, p.y + 3);
      }
      if (this.rabbit && this.debugShape) {
        ctx.strokeStyle = "rgba(120,255,170,0.5)";
        ctx.fillStyle = "rgba(120,255,170,0.9)";
        ctx.lineWidth = 1;
        for (const [a, b] of this.rabbit.segments) {
          const pa = sky.project(sky.dir(this.rabbit.stars[a])), pb = sky.project(sky.dir(this.rabbit.stars[b]));
          ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
        }
        this.rabbit.stars.forEach((s, k) => {
          const p = sky.project(sky.dir(s));
          ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, TAU); ctx.stroke();
          ctx.fillText(String(k + 1), p.x + 8, p.y - 8);
        });
      }
    }
  }

  private drawRings(time: number) {
    const { ctx, sky } = this;
    this.rings = this.rings.filter((r) => time - r.t0 < 1.4);
    for (const r of this.rings) {
      const t = (time - r.t0) / 1.4;
      const p = sky.project(r.dir);
      const e = 1 - Math.pow(1 - t, 3);
      const col = r.warm ? PINK : "214, 226, 255";
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26 + e * 22);
      g.addColorStop(0, `rgba(${col}, ${0.5 * (1 - t) * (1 - t)})`);
      g.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 26 + e * 22, 0, TAU); ctx.fill();
      // gerbe d'étincelles
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * TAU + r.t0 * 3.7 + Math.sin(k * 12.9 + r.t0) * 0.3;
        const reach = 16 + (Math.sin(k * 7.1 + r.t0 * 5.0) * 0.5 + 0.5) * 30;
        const r1 = 9 + e * reach, r0 = r1 - 7 * (1 - t);
        ctx.strokeStyle = `rgba(${col}, ${0.8 * (1 - t) * (1 - t)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
        ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      for (const [delay, max] of [[0, 46], [0.16, 30]] as const) {
        const tt = Math.max(0, (t - delay) / (1 - delay));
        if (tt <= 0) continue;
        const ee = 1 - Math.pow(1 - tt, 3);
        ctx.strokeStyle = `rgba(${col}, ${0.55 * (1 - tt)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 + ee * max, 0, TAU); ctx.stroke();
      }
    }
  }

  private drawMeteors(time: number, dt: number, w: number, h: number) {
    const { ctx } = this;

    // poussière d'étoiles qui flotte très lentement
    if (!this.reduced) {
      if (!this.motes.length) {
        for (let i = 0; i < 28; i++) {
          this.motes.push({ x: Math.random(), y: Math.random(), vx: -2 - Math.random() * 5, vy: -3 - Math.random() * 6, phase: Math.random() * TAU, sp: 0.5 + Math.random() * 1.3, r: 0.5 + Math.random() * 0.9 });
        }
      }
      const vis = this.sky.reveal * (0.45 + 0.55 * this.sky.dim);
      for (const m of this.motes) {
        m.x += ((m.vx + Math.sin(time * 0.4 + m.phase) * 3) * dt) / w;
        m.y += (m.vy * dt) / h;
        if (m.y < -0.02) { m.y = 1.02; m.x = Math.random(); }
        if (m.x < -0.02) m.x = 1.02;
        const tw = Math.pow(0.5 + 0.5 * Math.sin(time * m.sp + m.phase), 3);
        if (tw < 0.02) continue;
        ctx.fillStyle = `rgba(226, 232, 255, ${0.5 * tw * vis})`;
        ctx.beginPath(); ctx.arc(m.x * w, m.y * h, m.r, 0, TAU); ctx.fill();
      }
    }

    // scintillements au toucher : une petite étoile à quatre branches
    this.bursts = this.bursts.filter((q) => time - q.t0 < 0.7);
    for (const q of this.bursts) {
      const t = (time - q.t0) / 0.7;
      const e = 1 - Math.pow(1 - t, 3);
      const al = (1 - t) * (1 - t);
      for (let k = 0; k < 4; k++) {
        const ang = (k / 4) * TAU + 0.4;
        const len = (k % 2 ? 7 : 13) * (0.4 + 0.6 * e);
        const lg = ctx.createLinearGradient(q.x, q.y, q.x + Math.cos(ang) * len, q.y + Math.sin(ang) * len);
        lg.addColorStop(0, `rgba(240, 244, 255, ${0.9 * al})`);
        lg.addColorStop(1, "rgba(240, 244, 255, 0)");
        ctx.strokeStyle = lg;
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.moveTo(q.x - Math.cos(ang) * len, q.y - Math.sin(ang) * len); ctx.lineTo(q.x + Math.cos(ang) * len, q.y + Math.sin(ang) * len); ctx.stroke();
      }
    }

    // étoiles filantes
    if ((this.meteorsOn && time > this.nextMeteor) || this.force) {
      this.nextMeteor = time + 8 + Math.random() * 12;
      const fromLeft = Math.random() < 0.5;
      const ang = Math.PI / 2 + (fromLeft ? -1 : 1) * (0.5 + Math.random() * 0.55);
      const big = this.force || Math.random() < 0.14;
      this.force = false;
      const life = (big ? 1.25 : 0.75) + Math.random() * 0.35;
      this.meteors.push({
        x0: w * (fromLeft ? 0.02 + Math.random() * 0.45 : 0.53 + Math.random() * 0.45),
        y0: h * (0.04 + Math.random() * 0.3),
        ux: Math.cos(ang),
        uy: Math.sin(ang),
        dist: Math.min(w, h) * (big ? 1.05 : 0.6 + Math.random() * 0.3),
        t0: time,
        life,
        len: (big ? 290 : 160) + Math.random() * 110,
        w: big ? 4.2 : 2.3 + Math.random() * 1.0,
        big,
      });
      this.onMeteor?.(big);
    }
    this.meteors = this.meteors.filter((m) => time - m.t0 < m.life);
    for (const m of this.meteors) {
      const t = (time - m.t0) / m.life;
      // elle part vite puis ralentit en s'éteignant
      const e = 1 - Math.pow(1 - t, 2.2);
      const hx = m.x0 + m.ux * m.dist * e, hy = m.y0 + m.uy * m.dist * e;
      const al = Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08)), 0.6);
      const len = m.len * Math.min(1, t * 3.2) * (1 - 0.45 * t);
      const tx = hx - m.ux * len, ty = hy - m.uy * len;
      const nx = -m.uy, ny = m.ux;
      // traînée effilée : large à la tête, pointue à la queue
      const g = ctx.createLinearGradient(hx, hy, tx, ty);
      g.addColorStop(0, `rgba(255, 255, 255, ${0.95 * al})`);
      g.addColorStop(0.12, `rgba(214, 228, 255, ${0.6 * al})`);
      g.addColorStop(0.5, `rgba(170, 190, 255, ${0.18 * al})`);
      g.addColorStop(1, "rgba(170, 190, 255, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(hx + nx * m.w * 0.5, hy + ny * m.w * 0.5);
      ctx.lineTo(tx, ty);
      ctx.lineTo(hx - nx * m.w * 0.5, hy - ny * m.w * 0.5);
      ctx.closePath();
      ctx.fill();
      // sillage diffus
      const g2 = ctx.createLinearGradient(hx, hy, tx, ty);
      g2.addColorStop(0, `rgba(190, 206, 255, ${0.16 * al})`);
      g2.addColorStop(1, "rgba(190, 206, 255, 0)");
      ctx.strokeStyle = g2;
      ctx.lineWidth = m.w * 3.2;
      ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - m.ux * len * 0.6, hy - m.uy * len * 0.6); ctx.stroke();
      // tête lumineuse
      const R = m.w * (m.big ? 7 : 5);
      const hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, R);
      hg.addColorStop(0, `rgba(255, 255, 255, ${al})`);
      hg.addColorStop(0.25, `rgba(220, 232, 255, ${0.5 * al})`);
      hg.addColorStop(1, "rgba(200, 216, 255, 0)");
      ctx.fillStyle = hg;
      ctx.beginPath(); ctx.arc(hx, hy, R, 0, TAU); ctx.fill();
      // elle sème quelques étincelles qui restent un instant
      if (!this.reduced && Math.random() < dt * (m.big ? 70 : 34)) {
        const k = Math.random() * 0.5;
        this.sparks.push({
          x: hx - m.ux * len * k + nx * (Math.random() - 0.5) * 5,
          y: hy - m.uy * len * k + ny * (Math.random() - 0.5) * 5,
          vx: m.ux * 14 + nx * (Math.random() - 0.5) * 16,
          vy: m.uy * 14 + ny * (Math.random() - 0.5) * 16 + 5,
          t0: time,
          life: 0.5 + Math.random() * (m.big ? 1.4 : 0.8),
          r: 0.45 + Math.random() * 0.75,
        });
      }
    }
  }

  private drawRabbit(time: number, dt: number) {
    const { ctx, sky, rabbit, parts } = this;
    if (!rabbit || !parts || this.linesAlpha <= 0.001) return;
    const pts = rabbit.stars.map((i) => sky.project(sky.dir(i)));
    const alpha = this.linesAlpha;
    const c = sky.project(rabbit.center);
    const R = this.rabbitRadiusPx();

    if (this.flash > 0.001) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 2.2);
      g.addColorStop(0, `rgba(${WARM}, ${0.26 * this.flash})`);
      g.addColorStop(0.45, `rgba(${WARM}, ${0.09 * this.flash})`);
      g.addColorStop(1, `rgba(${WARM}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * 2.2, 0, TAU); ctx.fill();
    }

    // ── 1. la constellation : traits droits, très fins ──
    const sk = alpha * this.skeleton;
    rabbit.segments.forEach(([a, b], k) => {
      const t = this.seg[k] ?? 0;
      if (t <= 0) return;
      const A = pts[a], B = pts[b];
      const x = A.x + (B.x - A.x) * t, y = A.y + (B.y - A.y) * t;
      for (const [width, a2] of [[5, 0.05], [0.9, 0.7]] as const) {
        ctx.strokeStyle = `rgba(${WARM}, ${a2 * sk})`;
        ctx.lineWidth = width;
        ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(x, y); ctx.stroke();
      }
      if (t < 1) this.glint(x, y, 14, alpha, time, dt, 1);
    });

    if (this.art <= 0.001) return;

    // ── 2. le lapin, posé sur ses étoiles sans être déformé ──
    const place = placeOn(this.anchors, pts.map((q) => q.x), pts.map((q) => q.y));
    const u = place.scale; // pixels par unité de l'icône
    const breath = Math.sin(time * 1.35) * this.breathe;
    const glow = 1 + 0.1 * breath;

    // une lueur douce derrière lui
    if (this.artFill > 0.001) {
      const [hx, hy] = apply(place, HEART[0], HEART[1]);
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, u * 15);
      g.addColorStop(0, `rgba(${WARM}, ${0.085 * this.artFill * alpha * glow})`);
      g.addColorStop(0.5, `rgba(255, 214, 190, ${0.03 * this.artFill * alpha})`);
      g.addColorStop(1, "rgba(255, 214, 190, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(hx, hy, u * 15, 0, TAU); ctx.fill();
    }

    ctx.save();
    ctx.transform(...place.m);
    // respiration et petit bond : tout le lapin, depuis ses pattes
    ctx.translate(GROUND[0], GROUND[1] - this.hop * 0.6);
    ctx.scale(1 - 0.006 * breath, 1 + 0.012 * breath);
    ctx.translate(-GROUND[0], -GROUND[1]);
    const passes: [number, number][] = [[10, 0.03 * glow], [4.2, 0.09 * glow], [1.5, 0.96]];
    for (const part of parts) {
      const t = Math.max(0, Math.min(1, (this.art - part.start) / part.dur));
      if (t <= 0) continue;
      const e = t < 1 ? (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2) : 1; // ease-in-out-cubic
      ctx.save();
      if (part.pivot) {
        const ang = (part.kind === "ear" ? this.earG : this.tailWag) * (part.amp ?? 0.1);
        ctx.translate(part.pivot[0], part.pivot[1]);
        ctx.rotate(ang);
        ctx.translate(-part.pivot[0], -part.pivot[1]);
      }
      ctx.setLineDash(e < 1 ? [part.len * e, part.len * 2] : []);
      for (const [width, a2] of passes) {
        ctx.strokeStyle = `rgba(${WARM}, ${a2 * alpha})`;
        ctx.lineWidth = width / u;
        ctx.stroke(part.path);
      }
      ctx.restore();
    }
    ctx.setLineDash([]);

    // l'œil : un simple point doux, qui cligne
    const eyeIn = Math.max(0, Math.min(1, (this.art - 0.86) / 0.14));
    if (eyeIn > 0) {
      const open = Math.max(0.15, 1 - this.blink);
      const r = 0.34 * (0.7 + 0.3 * eyeIn);
      ctx.fillStyle = `rgba(${WARM}, ${0.95 * eyeIn * alpha})`;
      ctx.beginPath(); ctx.ellipse(EYE[0], EYE[1], r, r * open, 0, 0, TAU); ctx.fill();
    }
    ctx.restore();

    // la lumière qui court en tête de trait
    for (const part of parts) {
      const t = (this.art - part.start) / part.dur;
      if (t <= 0 || t >= 1 || !part.measure) continue;
      const e = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
      const pt = part.measure.getPointAtLength(part.len * e);
      const [gx, gy] = apply(place, pt.x, pt.y);
      this.glint(gx, gy, part.kind === "body" ? 17 : 10, alpha, time, dt, part.kind === "body" ? 3 : 0);
    }

    // légende, façon atlas du ciel
    if (this.caption && this.artFill > 0.001) {
      let bottom = -Infinity;
      for (const q of pts) bottom = Math.max(bottom, q.y);
      ctx.font = '500 11px "Cormorant Garamond", serif';
      ctx.textAlign = "center";
      (ctx as any).letterSpacing = "4.5px";
      ctx.fillStyle = `rgba(${WARM}, ${0.6 * alpha * this.artFill})`;
      ctx.fillText(this.caption.toUpperCase(), c.x + 2, bottom + 40);
      (ctx as any).letterSpacing = "0px";
    }
  }

  /** La petite lumière en tête de trait, et les étincelles qu'elle sème. */
  private glint(x: number, y: number, r: number, alpha: number, time: number, dt: number, sparks: number) {
    const { ctx } = this;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(255, 252, 244, ${0.95 * alpha})`);
    g.addColorStop(0.22, `rgba(${WARM}, ${0.5 * alpha})`);
    g.addColorStop(1, `rgba(${WARM}, 0)`);
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
    if (this.reduced) return;
    for (let i = 0; i < sparks; i++) {
      if (Math.random() > dt * 30) continue;
      const a = Math.random() * TAU, v = 6 + Math.random() * 26;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v + 6, t0: time, life: 0.5 + Math.random() * 0.9, r: 0.5 + Math.random() * 0.8 });
    }
  }

  private drawHearts(time: number, dt: number) {
    const { ctx } = this;
    // étincelles semées par le tracé
    this.sparks = this.sparks.filter((s) => time - s.t0 < s.life);
    for (const s of this.sparks) {
      const t = (time - s.t0) / s.life;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - dt * 2.2;
      s.vy *= 1 - dt * 2.2;
      ctx.fillStyle = `rgba(255, 244, 222, ${0.9 * (1 - t) * (1 - t)})`;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, TAU); ctx.fill();
    }

    this.hearts = this.hearts.filter((hh) => time - hh.t0 < hh.life);
    for (const hh of this.hearts) {
      const t = (time - hh.t0) / hh.life;
      hh.y -= hh.vy * dt;
      const x = hh.x + Math.sin(time * 1.1 + hh.phase) * hh.sway;
      const a = Math.min(1, t * 4) * Math.pow(1 - t, 1.3);
      const s = hh.size * (0.6 + 0.4 * Math.min(1, t * 3));
      const g = ctx.createRadialGradient(x, hh.y, 0, x, hh.y, s * 3);
      g.addColorStop(0, `rgba(255, 176, 196, ${0.26 * a})`);
      g.addColorStop(1, "rgba(255, 176, 196, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, hh.y, s * 3, 0, TAU); ctx.fill();
      ctx.save();
      ctx.translate(x, hh.y);
      ctx.rotate(hh.rot + Math.sin(time * 1.1 + hh.phase) * 0.16);
      ctx.scale(s / 10, s / 10);
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-13, -1, -8, -10, 0, -3.5);
      ctx.bezierCurveTo(8, -10, 13, -1, 0, 8);
      ctx.fillStyle = `rgba(255, 190, 206, ${0.4 * a})`;
      ctx.fill();
      ctx.strokeStyle = `rgba(255, 232, 238, ${0.95 * a})`;
      ctx.lineWidth = 10 / s;
      ctx.stroke();
      ctx.restore();
    }
  }
}
