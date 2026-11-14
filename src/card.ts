// Carte de message : monte depuis le bas, texte lettre par lettre,
// se ferme d'un tap ou d'un glissement vers le bas.
export class Card {
  private el = document.getElementById("card")!;
  private kicker = this.el.querySelector(".card-kicker") as HTMLElement;
  private text = this.el.querySelector(".card-text") as HTMLElement;
  private timer = 0;
  private openedAt = 0;
  isOpen = false;
  onClose: (() => void) | null = null;

  constructor(private reduced: boolean) {
    let startY = 0, drag = 0, active = false;
    this.el.addEventListener("pointerdown", (e) => {
      if (!this.isOpen) return;
      active = true;
      startY = e.clientY;
      drag = 0;
      this.el.setPointerCapture(e.pointerId);
      this.el.classList.add("dragging");
    });
    this.el.addEventListener("pointermove", (e) => {
      if (!active) return;
      drag = Math.max(0, e.clientY - startY);
      this.el.style.setProperty("--drag", drag + "px");
    });
    const end = () => {
      if (!active) return;
      active = false;
      this.el.classList.remove("dragging");
      this.el.style.removeProperty("--drag");
      // un tap ferme (ou termine l'écriture) ; un glissement de plus de 50 px ferme aussi
      if (drag > 50) this.close();
      else if (drag < 8) this.tap();
    };
    this.el.addEventListener("pointerup", end);
    this.el.addEventListener("pointercancel", end);
  }

  /** Tap : finit d'écrire le texte s'il est en cours, sinon ferme. */
  tap() {
    if (!this.isOpen) return;
    if (this.timer) {
      this.finish();
      return;
    }
    if (performance.now() - this.openedAt > 350) this.close();
  }

  open(kicker: string, message: string) {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.kicker.textContent = kicker;
    this.text.textContent = "";
    // chaque lettre est déjà en place (invisible) : la mise en page ne bouge pas pendant l'écriture
    const chars: HTMLElement[] = [];
    for (const part of message.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) {
        this.text.appendChild(document.createTextNode(part));
        continue;
      }
      const word = document.createElement("span");
      word.className = "w";
      for (const ch of Array.from(part)) {
        const c = document.createElement("span");
        c.className = "c";
        c.textContent = ch;
        word.appendChild(c);
        chars.push(c);
      }
      this.text.appendChild(word);
    }
    this.el.classList.add("open");
    this.el.setAttribute("aria-hidden", "false");
    this.isOpen = true;
    this.openedAt = performance.now();

    if (this.reduced) {
      chars.forEach((c) => c.classList.add("on"));
      return;
    }
    let i = 0;
    const startDelay = 380;
    const t0 = performance.now() + startDelay;
    const perChar = Math.max(11, Math.min(26, 2600 / Math.max(1, chars.length)));
    this.timer = window.setInterval(() => {
      const target = Math.floor((performance.now() - t0) / perChar);
      while (i < chars.length && i <= target) chars[i++].classList.add("on");
      if (i >= chars.length) {
        window.clearInterval(this.timer);
        this.timer = 0;
      }
    }, 16);
  }

  private finish() {
    window.clearInterval(this.timer);
    this.timer = 0;
    this.text.querySelectorAll(".c").forEach((c) => c.classList.add("on"));
  }

  close(silent = false) {
    if (!this.isOpen) return;
    window.clearInterval(this.timer);
    this.timer = 0;
    this.isOpen = false;
    this.el.classList.remove("open");
    this.el.setAttribute("aria-hidden", "true");
    if (!silent) this.onClose?.();
  }
}
