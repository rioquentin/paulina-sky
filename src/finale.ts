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
    const name = nameEl.textContent ?? "";
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
    const SEG = 0.56, STEP = 0.6, START = 2.7;

    // 1. le ciel se calme, on se rapproche du lapin
    tl.to(["#progress", "#place", "#hint"], { opacity: 0, duration: 1.2, ease: "sine.out" }, 0);
    tl.to(sky, { dim: 0.36, calm: 0.4, duration: 2.8, ease: "sine.inOut" }, 0);
    tl.to(focus, { t: 1, duration: reduced ? 1.6 : 3.3, ease: "power2.inOut" }, 0);
    tl.set(fx, { linesAlpha: 1 }, START - 0.1);

    // 2. les traits, un par un, avec une gamme qui monte
    rabbit.segments.forEach((_, k) => {
      const at = START + k * STEP;
      const o = { v: 0 };
      tl.to(o, { v: 1, duration: SEG, ease: "power1.inOut", onUpdate: () => (fx.seg[k] = o.v) }, at);
      tl.call(() => sound.chime(k + 1, 0.8), [], at);
    });
    const done = START + (rabbit.segments.length - 1) * STEP + SEG;

    // 3. le lapin est complet : éclat doux, puis il respire
    tl.call(
      () => {
        sound.bloom();
        if (!reduced) rabbit.stars.forEach((s, i) => gsap.delayedCall(i * 0.045, () => fx.ring(sky.dir(s), now())));
      },
      [],
      done + 0.12,
    );
    tl.to(fx, { flash: 1, duration: 0.4, ease: "power2.out" }, done + 0.12);
    tl.to(fx, { flash: 0, duration: 2.0, ease: "sine.out" }, done + 0.52);
    tl.to(fx, { tailRing: 1, duration: 0.9, ease: "power2.out" }, done + 0.25);
    tl.to(fx, { breathe: 1, duration: 2.2, ease: "sine.inOut" }, done + 0.5);
    tl.to(sky, { dim: 0.5, duration: 3, ease: "sine.inOut" }, done + 0.5);

    // une oreille qui frétille, de temps en temps
    if (!reduced) {
      tl.call(
        () => {
          const twitch = gsap.timeline({ repeat: -1, repeatDelay: 4.6 });
          twitch
            .to(fx, { earTwitch: 1, duration: 0.11, ease: "power2.out" })
            .to(fx, { earTwitch: -0.55, duration: 0.13, ease: "sine.inOut" })
            .to(fx, { earTwitch: 0.7, duration: 0.12, ease: "sine.inOut" })
            .to(fx, { earTwitch: 0, duration: 0.5, ease: "elastic.out(1, 0.4)" });
          this.loops.push(twitch);
        },
        [],
        done + 1.5,
      );
    }

    // 4. quelques cœurs, sans confettis
    const hearts = reduced ? 5 : 11;
    for (let i = 0; i < hearts; i++) {
      tl.call(() => fx.heart(now()), [], done + 0.9 + i * 0.5 + (i % 3) * 0.12);
    }
    tl.call(
      () => {
        this.trickle = window.setInterval(() => fx.heart(now()), reduced ? 3200 : 1700);
      },
      [],
      done + 0.9 + hearts * 0.5,
    );

    // 5. le message
    const msg = done + 1.7;
    tl.call(() => { panel.classList.add("on"); panel.setAttribute("aria-hidden", "false"); }, [], msg);
    tl.to(panel, { opacity: 1, duration: 1.6, ease: "sine.out" }, msg);
    tl.to(parts[0], { opacity: 1, y: 0, duration: 1.4, ease: "power2.out" }, msg + 0.2);
    tl.to(letters, { opacity: 1, y: 0, filter: "blur(0px)", duration: reduced ? 0.8 : 1.5, ease: "power3.out", stagger: reduced ? 0 : Math.min(0.09, 0.8 / Math.max(1, letters.length)) }, msg + 0.7);
    tl.to(parts[2], { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" }, msg + 1.9);
    tl.to(parts[3], { opacity: 1, y: 0, duration: 1.6, ease: "power2.out" }, msg + 2.8);
    tl.to(parts[4], { opacity: 1, y: 0, duration: 1.4, ease: "sine.out" }, msg + 4.2);
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
    tl.call(() => {
      panel.classList.remove("on");
      panel.setAttribute("aria-hidden", "true");
      const nameEl = $(".f-name");
      nameEl.textContent = nameEl.getAttribute("aria-label") ?? nameEl.textContent;
    }, [], 0.9);
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
    this.c.fx.earTwitch = 0;
  }
}
