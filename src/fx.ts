// Calque 2D au-dessus du ciel : anneaux de tap, étoiles filantes, traits du lapin, cœurs.
import type { Sky } from "./sky";
import type { Rabbit } from "./rabbit";
import type { Vec3 } from "./astro";

interface Ring { dir: Vec3; t0: number; warm: boolean }
interface Meteor { x: number; y: number; vx: number; vy: number; t0: number; life: number; len: number }
interface Heart { x: number; y: number; vy: number; sway: number; phase: number; size: number; t0: number; life: number; rot: number }

const WARM = "255, 232, 196";

export class Fx {
  private ctx: CanvasRenderingContext2D;
  private ratio = 1;
  private rings: Ring[] = [];
  private meteors: Meteor[] = [];
  private hearts: Heart[] = [];
  private nextMeteor = 6;

  rabbit: Rabbit | null = null;
  /** Avancement de chaque trait (0..1). */
  seg: number[] = [];
  linesAlpha = 0;
  flash = 0;
  breathe = 0; // 0..1 : intensité de la respiration
  earTwitch = 0; // -1..1
  tailRing = 0;
  debug = false;
  labels: { dir: Vec3; text: string }[] = [];
  /** Petite légende sous la constellation, façon atlas du ciel. */
  caption = "";
  private dust: { k: number; u: number; off: number; phase: number; sp: number; r: number }[] = [];
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
    this.seg = this.rabbit ? this.rabbit.segments.map(() => 0) : [];
    this.linesAlpha = 0;
    this.flash = 0;
    this.breathe = 0;
    this.earTwitch = 0;
    this.tailRing = 0;
    this.hearts.length = 0;
    // poussière d'étoiles posée le long des traits
    this.dust = [];
    this.seg.forEach((_, k) => {
      const n = 5 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) {
        this.dust.push({ k, u: 0.06 + Math.random() * 0.88, off: (Math.random() - 0.5) * 13, phase: Math.random() * 6.28, sp: 1.2 + Math.random() * 2.2, r: 0.6 + Math.random() * 0.9 });
      }
    });
  }

  /** Fait naître un cœur près du lapin. */
  heart(time: number) {
    if (!this.rabbit) return;
    const c = this.sky.project(this.rabbit.center);
    const r = this.rabbitRadiusPx();
    const a = Math.random() * Math.PI * 2;
    const k = 0.35 + Math.random() * 0.75;
    this.hearts.push({
      x: c.x + Math.cos(a) * r * k,
      y: c.y + Math.sin(a) * r * k * 0.8 + r * 0.25,
      vy: 14 + Math.random() * 16,
      sway: 5 + Math.random() * 9,
      phase: Math.random() * 6.28,
      size: 6.5 + Math.random() * 6,
      t0: time,
      life: 4.2 + Math.random() * 2.4,
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
    this.drawRabbit(time);
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
    }
    if (this.debug && this.rabbit) {
      ctx.globalCompositeOperation = "source-over";
      ctx.strokeStyle = "rgba(120,255,170,0.5)";
      ctx.fillStyle = "rgba(120,255,170,0.9)";
      ctx.lineWidth = 1;
      ctx.font = "10px ui-monospace, monospace";
      for (const [a, b] of this.rabbit.segments) {
        const pa = sky.project(sky.dir(this.rabbit.stars[a])), pb = sky.project(sky.dir(this.rabbit.stars[b]));
        ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      }
      this.rabbit.stars.forEach((s, k) => {
        const p = sky.project(sky.dir(s));
        ctx.beginPath(); ctx.arc(p.x, p.y, 28, 0, 6.283); ctx.stroke();
        ctx.fillText(String(k + 1), p.x + 8, p.y - 8);
      });
    }
  }

  private drawRings(time: number) {
    const { ctx, sky } = this;
    this.rings = this.rings.filter((r) => time - r.t0 < 1.4);
    for (const r of this.rings) {
      const t = (time - r.t0) / 1.4;
      const p = sky.project(r.dir);
      const e = 1 - Math.pow(1 - t, 3);
      const col = r.warm ? WARM : "214, 226, 255";
      // éclat central
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 26 + e * 22);
      g.addColorStop(0, `rgba(${col}, ${0.5 * (1 - t) * (1 - t)})`);
      g.addColorStop(1, `rgba(${col}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(p.x, p.y, 26 + e * 22, 0, 6.283); ctx.fill();
      // gerbe d'étincelles
      for (let k = 0; k < 9; k++) {
        const ang = (k / 9) * 6.283 + r.t0 * 3.7 + Math.sin(k * 12.9 + r.t0) * 0.3;
        const reach = 16 + (Math.sin(k * 7.1 + r.t0 * 5.0) * 0.5 + 0.5) * 30;
        const r1 = 9 + e * reach, r0 = r1 - 7 * (1 - t);
        ctx.strokeStyle = `rgba(${col}, ${0.8 * (1 - t) * (1 - t)})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x + Math.cos(ang) * r0, p.y + Math.sin(ang) * r0);
        ctx.lineTo(p.x + Math.cos(ang) * r1, p.y + Math.sin(ang) * r1);
        ctx.stroke();
      }
      // deux anneaux fins
      for (const [delay, max] of [[0, 46], [0.16, 30]] as const) {
        const tt = Math.max(0, (t - delay) / (1 - delay));
        if (tt <= 0) continue;
        const ee = 1 - Math.pow(1 - tt, 3);
        ctx.strokeStyle = `rgba(${col}, ${0.55 * (1 - tt)})`;
        ctx.lineWidth = 1.1;
        ctx.beginPath(); ctx.arc(p.x, p.y, 7 + ee * max, 0, 6.283); ctx.stroke();
      }
    }
  }

  private drawMeteors(time: number, dt: number, w: number, h: number) {
    const { ctx } = this;
    if (this.meteorsOn && time > this.nextMeteor) {
      this.nextMeteor = time + 8 + Math.random() * 12;
      const fromLeft = Math.random() < 0.5;
      const ang = (fromLeft ? 1 : -1) * (0.35 + Math.random() * 0.5) + Math.PI / 2;
      const speed = 620 + Math.random() * 380;
      this.meteors.push({
        x: w * (fromLeft ? 0.05 + Math.random() * 0.45 : 0.5 + Math.random() * 0.45),
        y: h * (0.06 + Math.random() * 0.34),
        vx: Math.cos(ang) * speed * (fromLeft ? 1 : 1),
        vy: Math.sin(ang) * speed,
        t0: time,
        life: 0.55 + Math.random() * 0.35,
        len: 90 + Math.random() * 90,
      });
    }
    this.meteors = this.meteors.filter((m) => time - m.t0 < m.life);
    for (const m of this.meteors) {
      const t = (time - m.t0) / m.life;
      m.x += m.vx * dt;
      m.y += m.vy * dt;
      const sp = Math.hypot(m.vx, m.vy);
      const ux = m.vx / sp, uy = m.vy / sp;
      const a = Math.sin(Math.PI * Math.min(1, t * 1.15)) * 0.85;
      const len = m.len * Math.min(1, t * 4);
      const tx = m.x - ux * len, ty = m.y - uy * len;
      const g = ctx.createLinearGradient(m.x, m.y, tx, ty);
      g.addColorStop(0, `rgba(240, 244, 255, ${a})`);
      g.addColorStop(0.25, `rgba(200, 214, 255, ${a * 0.4})`);
      g.addColorStop(1, "rgba(200, 214, 255, 0)");
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.moveTo(m.x, m.y); ctx.lineTo(tx, ty); ctx.stroke();
      ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
      ctx.beginPath(); ctx.arc(m.x, m.y, 1.3, 0, 6.283); ctx.fill();
    }
  }

  private drawRabbit(time: number) {
    const { ctx, sky, rabbit } = this;
    if (!rabbit || this.linesAlpha <= 0.001) return;
    const pts = rabbit.stars.map((i) => sky.project(sky.dir(i)));
    const breath = 1 + this.breathe * 0.16 * Math.sin(time * 1.5);
    const alpha = this.linesAlpha;
    const c = sky.project(rabbit.center);
    const R = this.rabbitRadiusPx();

    if (this.flash > 0.001) {
      const g = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, R * 2.1);
      g.addColorStop(0, `rgba(${WARM}, ${0.34 * this.flash})`);
      g.addColorStop(0.45, `rgba(${WARM}, ${0.12 * this.flash})`);
      g.addColorStop(1, `rgba(${WARM}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * 2.1, 0, 6.283); ctx.fill();
    }

    // halo permanent, très léger, quand le lapin respire
    if (this.breathe > 0.01) {
      const g = ctx.createRadialGradient(c.x, c.y, R * 0.1, c.x, c.y, R * 1.5);
      g.addColorStop(0, `rgba(${WARM}, ${0.06 * this.breathe * breath * alpha})`);
      g.addColorStop(1, `rgba(${WARM}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(c.x, c.y, R * 1.5, 0, 6.283); ctx.fill();
    }

    const passes: [number, number][] = [
      [9, 0.045 * breath],
      [4.2, 0.12 * breath],
      [1.25, 0.92],
    ];
    rabbit.segments.forEach(([a, b], k) => {
      const t = this.seg[k] ?? 0;
      if (t <= 0) return;
      const A = pts[a], B = pts[b];
      // les oreilles se courbent quand elles frétillent
      const isEar = rabbit.ears.includes(k);
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const bend = isEar ? this.earTwitch * len * 0.16 * (rabbit.ears.indexOf(k) === 0 ? 1 : -0.7) : 0;
      const nx = -dy / len, ny = dx / len;
      // une oreille = une feuille : deux courbes de la base à la pointe
      const sides = isEar ? [-1, 1] : [0];
      const at = (u: number, side: number) => {
        const off = bend + side * len * 0.15;
        const mx = (A.x + B.x) / 2 + nx * off, my = (A.y + B.y) / 2 + ny * off;
        const v = 1 - u;
        return { x: v * v * A.x + 2 * v * u * mx + u * u * B.x, y: v * v * A.y + 2 * v * u * my + u * u * B.y };
      };
      const steps = isEar ? 14 : 1;
      for (const [width, a2] of passes) {
        ctx.strokeStyle = `rgba(${WARM}, ${a2 * alpha})`;
        ctx.lineWidth = width;
        for (const side of sides) {
          ctx.beginPath();
          ctx.moveTo(A.x, A.y);
          for (let s = 1; s <= steps; s++) {
            const p = at((s / steps) * t, side);
            ctx.lineTo(p.x, p.y);
          }
          ctx.stroke();
        }
      }
      // la petite lumière qui court sur le trait
      if (t < 1) {
        const p1 = at(t, sides[0]), p2 = at(t, sides[sides.length - 1]);
        const p = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, 16);
        g.addColorStop(0, `rgba(255, 250, 240, ${0.95 * alpha})`);
        g.addColorStop(0.25, `rgba(${WARM}, ${0.5 * alpha})`);
        g.addColorStop(1, `rgba(${WARM}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(p.x, p.y, 16, 0, 6.283); ctx.fill();
      }
    });

    // poussière d'étoiles : apparaît au passage de la lumière, puis scintille
    for (const q of this.dust) {
      const t = this.seg[q.k] ?? 0;
      if (t < q.u) continue;
      const [a, b] = rabbit.segments[q.k];
      const A = pts[a], B = pts[b];
      const dx = B.x - A.x, dy = B.y - A.y;
      const len = Math.hypot(dx, dy) || 1;
      const x = A.x + dx * q.u + (-dy / len) * q.off, y = A.y + dy * q.u + (dx / len) * q.off;
      const tw = 0.35 + 0.65 * Math.pow(0.5 + 0.5 * Math.sin(time * q.sp + q.phase), 2);
      const fresh = Math.min(1, (t - q.u) * 6);
      ctx.fillStyle = `rgba(255, 244, 222, ${0.75 * tw * fresh * alpha})`;
      ctx.beginPath(); ctx.arc(x, y, q.r, 0, 6.283); ctx.fill();
    }

    // légende
    if (this.caption && this.tailRing > 0.001) {
      let bottom = -Infinity;
      for (const p of pts) bottom = Math.max(bottom, p.y);
      ctx.font = '500 11px "Cormorant Garamond", serif';
      ctx.textAlign = "center";
      (ctx as any).letterSpacing = "4.5px";
      ctx.fillStyle = `rgba(${WARM}, ${0.62 * alpha * this.tailRing})`;
      ctx.fillText(this.caption.toUpperCase(), c.x + 2, bottom + 34);
      (ctx as any).letterSpacing = "0px";
    }

    // l'œil
    if (this.tailRing > 0.001) {
      const e = rabbit.eye;
      const ex = pts[e.at[0]].x * e.w[0] + pts[e.at[1]].x * e.w[1] + pts[e.at[2]].x * e.w[2];
      const ey = pts[e.at[0]].y * e.w[0] + pts[e.at[1]].y * e.w[1] + pts[e.at[2]].y * e.w[2];
      const g = ctx.createRadialGradient(ex, ey, 0, ex, ey, 9);
      g.addColorStop(0, `rgba(255, 250, 240, ${0.95 * alpha * this.tailRing})`);
      g.addColorStop(0.22, `rgba(${WARM}, ${0.55 * alpha * this.tailRing})`);
      g.addColorStop(1, `rgba(${WARM}, 0)`);
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(ex, ey, 9, 0, 6.283); ctx.fill();
    }

    // queue ronde
    if (this.tailRing > 0.001) {
      const p = pts[rabbit.tail];
      const r = Math.max(7, R * 0.075) * (0.6 + 0.4 * this.tailRing);
      for (const [width, a2] of passes) {
        ctx.strokeStyle = `rgba(${WARM}, ${a2 * alpha * this.tailRing})`;
        ctx.lineWidth = width * 0.85;
        ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, 6.283 * this.tailRing); ctx.stroke();
      }
    }
  }

  private drawHearts(time: number, dt: number) {
    const { ctx } = this;
    this.hearts = this.hearts.filter((hh) => time - hh.t0 < hh.life);
    for (const hh of this.hearts) {
      const t = (time - hh.t0) / hh.life;
      hh.y -= hh.vy * dt;
      const x = hh.x + Math.sin(time * 1.1 + hh.phase) * hh.sway;
      const a = Math.min(1, t * 5) * Math.pow(1 - t, 1.4);
      const s = hh.size * (0.7 + 0.3 * Math.min(1, t * 4));
      const g = ctx.createRadialGradient(x, hh.y, 0, x, hh.y, s * 3.2);
      g.addColorStop(0, `rgba(255, 170, 190, ${0.3 * a})`);
      g.addColorStop(1, "rgba(255, 170, 190, 0)");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(x, hh.y, s * 3.2, 0, 6.283); ctx.fill();
      ctx.save();
      ctx.translate(x, hh.y);
      ctx.rotate(hh.rot + Math.sin(time * 1.1 + hh.phase) * 0.18);
      ctx.scale(s / 10, s / 10);
      ctx.fillStyle = `rgba(255, 216, 224, ${a})`;
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.bezierCurveTo(-13, -1, -8, -10, 0, -3.5);
      ctx.bezierCurveTo(8, -10, 13, -1, 0, 8);
      ctx.fill();
      ctx.restore();
    }
  }
}
