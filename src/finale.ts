import gsap from "gsap";
import type { Sky } from "./sky";
import type { Fx } from "./fx";
import type { Rabbit } from "./rabbit";
import { sound } from "./audio";

export interface FinaleCtx {
  sky: Sky;
  fx: Fx;
  rabbit: Rabbit;
  /** t : 0 = vue libre, 1 = cadré sur le lapin. */
  focus: { t: number };
  reduced: boolean;
  now: () => number;
}

const $ = (s: string) => document.querySelector(s) as HTMLElement;

export class Finale {
  private tl: gsap.core.Timeline | null = null;
  private loops: (gsap.core.Tween | gsap.core.Timeline)[] = [];
  private trickle = 0;
  playing = false;

  constructor(private c: FinaleCtx) {}

  play() {
    const { sky, fx, rabbit, focus, reduced, now } = this.c;
    this.kill();
    this.playing = true;
    fx.resetLines();
    const panel = $("#finale");
    const parts = [".f-kicker", ".f-name", ".f-msg", ".f-sign", "#again"].map($);
    gsap.set(panel, { opacity: 0 });
    gsap.set(parts, { opacity: 0, y: 14 });
    // le prénom s'écrit lettre à lettre
    const nameEl = parts[1];
    const name = nameEl.getAttribute("aria-label") ?? nameEl.textContent ?? "";
    nameEl.textContent = "";
    const letters = Array.from(name).map((ch) => {
      const sp = document.createElement("span");
      sp.textContent = ch === " " ? " " : ch;
      sp.style.display = "inline-block";
      nameEl.appendChild(sp);
      return sp;
    });
    nameEl.setAttribute("aria-label", name);
    gsap.set(nameEl, { opacity: 1, y: 0 });
    gsap.set(letters, { opacity: 0, y: 20, filter: "blur(7px)" });

    const tl = (this.tl = gsap.timeline());
    const SEG = 0.5, STEP = 0.5, START = 2.7;

    // 1. le ciel se calme, on se rapproche
    tl.to(["#progress", "#place", "#hint"], { opacity: 0, duration: 1.2, ease: "sine.out" }, 0);
    tl.to(sky, { dim: 0.34, calm: 0.4, duration: 2.8, ease: "sine.inOut" }, 0);
    tl.to(focus, { t: 1, duration: reduced ? 1.6 : 3.3, ease: "power2.inOut" }, 0);
    tl.set(fx, { linesAlpha: 1 }, START - 0.1);

    // 2. la constellation : un trait après l'autre, une note après l'autre
    rabbit.segments.forEach((_, k) => {
      const at = START + k * STEP;
      const o = { v: 0 };
      tl.to(o, { v: 1, duration: SEG, ease: "power2.inOut", onUpdate: () => (fx.seg[k] = o.v) }, at);
      tl.call(() => sound.chime(k + 1, 0.8), [], at);
    });
    const done = START + (rabbit.segments.length - 1) * STEP + SEG;

    // 3. un éclat, puis le lapin se dessine à la lumière autour de ses étoiles
    tl.call(
      () => {
        sound.bloom();
        if (!reduced) rabbit.stars.forEach((s, i) => gsap.delayedCall(i * 0.05, () => fx.ring(sky.dir(s), now())));
      },
      [],
      done + 0.1,
    );
    tl.to(fx, { flash: 1, duration: 0.45, ease: "power2.out" }, done + 0.1);
    tl.to(fx, { flash: 0, duration: 2.4, ease: "sine.out" }, done + 0.55);
    tl.to(fx, { art: 1, duration: reduced ? 1.4 : 3.4, ease: "none" }, done + 0.35);
    tl.to(fx, { skeleton: 0.22, duration: 2.4, ease: "sine.inOut" }, done + 1.2);
    tl.to(fx, { artFill: 1, duration: 2.6, ease: "sine.inOut" }, done + 1.9);
    tl.to(sky, { dim: 0.46, duration: 3, ease: "sine.inOut" }, done + 1.5);
    [9, 11, 12, 13].forEach((s, i) => tl.call(() => sound.chime(s, 0.32), [], done + 0.7 + i * 0.55));

    // 4. il vit : il respire, cligne de l'œil, remue le nez, une oreille frétille
    const alive = done + 3.3;
    tl.to(fx, { breathe: 1, duration: 2.4, ease: "sine.inOut" }, alive - 0.6);
    if (!reduced) {
      tl.call(
        () => {
          // l'oreille dressée frétille : aller vif, retour avec un léger rebond
          const ear = gsap.timeline({ repeat: -1, repeatDelay: 4.2 });
          ear
            .to(fx, { earG: 1, duration: 0.12, ease: "power2.out" })
            .to(fx, { earG: -0.35, duration: 0.14, ease: "sine.inOut" })
            .to(fx, { earG: 0, duration: 0.5, ease: "back.out(2.2)" });
          const blink = gsap.timeline({ repeat: -1, repeatDelay: 3.6, delay: 1.4 });
          blink
            .to(fx, { blink: 1, duration: 0.08, ease: "power1.in" })
            .to(fx, { blink: 0, duration: 0.14, ease: "power1.out" });
          const tail = gsap.timeline({ repeat: -1, repeatDelay: 5.4, delay: 2.8 });
          tail
            .to(fx, { tailWag: 1, duration: 0.1, ease: "power2.out" })
            .to(fx, { tailWag: -0.8, duration: 0.14, ease: "sine.inOut" })
            .to(fx, { tailWag: 0, duration: 0.45, ease: "back.out(2)" });
          // un tout petit bond de temps en temps
          const hop = gsap.timeline({ repeat: -1, repeatDelay: 7.5, delay: 5.2 });
          hop
            .to(fx, { hop: 1, duration: 0.2, ease: "power2.out" })
            .to(fx, { hop: 0, duration: 0.24, ease: "power2.in" })
            .to(fx, { hop: 0.35, duration: 0.13, ease: "power2.out" })
            .to(fx, { hop: 0, duration: 0.16, ease: "power2.in" });
          this.loops.push(ear, blink, tail, hop);
        },
        [],
        alive,
      );
    }

    // 5. quelques cœurs, sans confettis
    const hearts = reduced ? 4 : 9;
    for (let i = 0; i < hearts; i++) {
      tl.call(() => fx.heart(now()), [], done + 2.4 + i * 0.55 + (i % 3) * 0.13);
    }
    tl.call(
      () => {
        this.trickle = window.setInterval(() => fx.heart(now()), reduced ? 3400 : 1900);
      },
      [],
      done + 2.4 + hearts * 0.55,
    );

    // 6. le message
    const msg = done + 2.7;
    tl.call(() => { panel.classList.add("on"); panel.setAttribute("aria-hidden", "false"); }, [], msg);
    tl.to(panel, { opacity: 1, duration: 1.6, ease: "sine.out" }, msg);
    tl.to(parts[0], { opacity: 1, y: 0, duration: 1.4, ease: "power2.out" }, msg + 0.2);
    tl.to(
      letters,
      { opacity: 1, y: 0, filter: "blur(0px)", duration: reduced ? 0.8 : 1.5, ease: "power3.out", stagger: reduced ? 0 : Math.min(0.09, 0.8 / Math.max(1, letters.length)) },
      msg + 0.7,
    );
    tl.to(parts[2], { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" }, msg + 1.9);
    tl.to(parts[3], { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" }, msg + 2.8);
    tl.to(parts[4], { opacity: 1, y: 0, duration: 1.4, ease: "sine.out" }, msg + 4.0);
    return tl;
  }

  /** « Revoir le ciel » : tout revient à zéro. */
  reset(onDone: () => void) {
    const { sky, fx, focus } = this.c;
    this.kill();
    const panel = $("#finale");
    const tl = gsap.timeline({
      onComplete: () => {
        fx.resetLines();
        this.playing = false;
        onDone();
      },
    });
    tl.to(panel, { opacity: 0, duration: 0.9, ease: "sine.out" }, 0);
    tl.call(() => { panel.classList.remove("on"); panel.setAttribute("aria-hidden", "true"); }, [], 0.9);
    tl.to(fx, { linesAlpha: 0, breathe: 0, duration: 1.4, ease: "sine.inOut" }, 0.2);
    tl.to(focus, { t: 0, duration: 2.6, ease: "power2.inOut" }, 0.3);
    tl.to(sky, { dim: 1, calm: this.c.reduced ? 0.35 : 1, duration: 2.6, ease: "sine.inOut" }, 0.3);
    tl.to(["#progress", "#place"], { opacity: 1, duration: 1.4, ease: "sine.out" }, 1.6);
  }

  private kill() {
    this.tl?.kill();
    this.tl = null;
    this.loops.forEach((l) => l.kill());
    this.loops.length = 0;
    window.clearInterval(this.trickle);
    this.trickle = 0;
    const { fx } = this.c;
    fx.earG = fx.blink = fx.tailWag = fx.hop = 0;
  }
}
