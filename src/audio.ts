// Musique : un enregistrement de piano (public/music.m4a), lu en boucle, en fondu.
// Carillons : synthétisés (Web Audio), accordés sur la tonalité du morceau.
// Rien d'essentiel ne dépend du son : le bouton silencieux de l'iPhone le coupe.

// Gamme pentatonique de la bémol majeur (relatif de fa mineur, la tonalité du morceau), qui monte.
const SCALE = [349.23, 415.3, 466.16, 523.25, 622.25, 698.46, 830.61, 932.33, 1046.5, 1244.51, 1396.91, 1661.22, 1864.66, 2093.0];

const MUSIC_LEVEL = 0.62; // volume de fond
const MUSIC_DUCK = 0.32; // pendant qu'elle lit une carte

class Sound {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private wet!: GainNode;
  private padGain!: GainNode;
  private padStarted = false;
  private music: HTMLAudioElement | null = null;
  private musicGain: GainNode | null = null;
  private musicOut: GainNode | null = null;
  private ducked = false;
  private musicOn = false;
  enabled = true;

  /** Prépare le fichier tout de suite, pour qu'il soit prêt au premier tap. */
  preload() {
    if (this.music) return;
    const a = new Audio();
    a.src = import.meta.env.BASE_URL + "music.m4a";
    a.loop = true;
    a.preload = "auto";
    a.setAttribute("playsinline", "");
    this.music = a;
  }

  /** Lance la musique (dans le geste utilisateur, pour iOS), en fondu. */
  private startMusic() {
    this.preload();
    const a = this.music!;
    const ctx = this.ctx;
    if (ctx && !this.musicGain) {
      try {
        const src = ctx.createMediaElementSource(a);
        this.musicGain = ctx.createGain();
        this.musicGain.gain.value = 0;
        this.musicOut = ctx.createGain();
        this.musicOut.gain.value = this.enabled ? 1 : 0;
        src.connect(this.musicGain);
        this.musicGain.connect(this.musicOut);
        this.musicOut.connect(ctx.destination);
      } catch {
        this.musicGain = null;
      }
    }
    if (!this.musicGain) a.volume = 0; // repli sans Web Audio
    const p = a.play();
    if (p) p.catch(() => {});
    this.musicOn = true;
    this.level(MUSIC_LEVEL, 5);
  }

  /** Amène le volume de la musique à v en ~sec secondes. */
  private level(v: number, sec: number) {
    if (this.musicGain && this.ctx) {
      const g = this.musicGain.gain, t = this.ctx.currentTime;
      g.cancelScheduledValues(t);
      g.setValueAtTime(g.value, t);
      g.linearRampToValueAtTime(v, t + sec);
    } else if (this.music) {
      const a = this.music, from = a.volume, t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (sec * 1000));
        a.volume = Math.max(0, Math.min(1, (from + (v - from) * k) * (this.enabled ? 1 : 0)));
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    }
  }

  /** Baisse la musique pendant la lecture d'une carte, la remonte ensuite. */
  duck(on: boolean) {
    if (!this.musicOn || on === this.ducked) return;
    this.ducked = on;
    this.level(on ? MUSIC_DUCK : MUSIC_LEVEL, on ? 0.6 : 1.6);
  }

  /** À appeler dans un geste utilisateur (obligatoire sur iOS). */
  unlock() {
    try {
      if (!this.ctx) {
        const AC: typeof AudioContext = window.AudioContext || (window as any).webkitAudioContext;
        if (!AC) return;
        this.ctx = new AC();
        const ctx = this.ctx;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.ratio.value = 4;
        comp.connect(ctx.destination);
        this.master = ctx.createGain();
        this.master.gain.value = this.enabled ? 1 : 0;
        this.master.connect(comp);

        // petit écho diffus pour donner de l'espace aux carillons
        this.wet = ctx.createGain();
        this.wet.gain.value = 0.5;
        const d1 = ctx.createDelay(1);
        const d2 = ctx.createDelay(1);
        d1.delayTime.value = 0.27;
        d2.delayTime.value = 0.41;
        const fb = ctx.createGain();
        fb.gain.value = 0.42;
        const lp = ctx.createBiquadFilter();
        lp.type = "lowpass";
        lp.frequency.value = 2400;
        this.wet.connect(d1);
        d1.connect(d2);
        d2.connect(lp);
        lp.connect(fb);
        fb.connect(d1);
        d1.connect(this.master);
        lp.connect(this.master);

        this.padGain = ctx.createGain();
        this.padGain.gain.value = 0;
        const padLp = ctx.createBiquadFilter();
        padLp.type = "lowpass";
        padLp.frequency.value = 850;
        padLp.Q.value = 0.4;
        this.padGain.connect(padLp);
        padLp.connect(this.master);
      }
      if (this.ctx.state !== "running") void this.ctx.resume();
      // tampon silencieux : réveille la sortie audio d'iOS
      const src = this.ctx.createBufferSource();
      src.buffer = this.ctx.createBuffer(1, 1, 22050);
      src.connect(this.ctx.destination);
      src.start(0);
    } catch {
      this.ctx = null;
    }
    if (!this.musicOn) this.startMusic();
  }

  /** Nappe ambiante : quelques sinus désaccordés qui respirent lentement. */
  startPad() {
    const ctx = this.ctx;
    if (!ctx || this.padStarted) return;
    this.padStarted = true;
    const notes = [146.83, 220.0, 293.66, 329.63, 440.0];
    const now = ctx.currentTime;
    notes.forEach((f, i) => {
      for (const det of [-4, 5]) {
        const osc = ctx.createOscillator();
        osc.type = i < 2 ? "triangle" : "sine";
        osc.frequency.value = f;
        osc.detune.value = det + i;
        const g = ctx.createGain();
        g.gain.value = 0.05 / (1 + i * 0.35);
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.035 + i * 0.013 + (det > 0 ? 0.008 : 0);
        const lg = ctx.createGain();
        lg.gain.value = g.gain.value * 0.6;
        lfo.connect(lg);
        lg.connect(g.gain);
        osc.connect(g);
        g.connect(this.padGain);
        osc.start(now);
        lfo.start(now);
      }
    });
    this.padGain.gain.setValueAtTime(0, now);
    this.padGain.gain.linearRampToValueAtTime(0.9, now + 6);
  }

  /** Carillon doux. `step` = degré dans la gamme. */
  chime(step: number, gain = 1, delay = 0) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const f = SCALE[Math.max(0, Math.min(SCALE.length - 1, step))];
    const t = ctx.currentTime + delay;
    const out = ctx.createGain();
    out.gain.value = 0.11 * gain;
    out.connect(this.master);
    out.connect(this.wet);
    const partials: [number, number, number][] = [
      [1, 1, 2.6],
      [2, 0.28, 1.6],
      [2.76, 0.16, 1.0],
      [5.4, 0.05, 0.5],
    ];
    for (const [ratio, amp, dur] of partials) {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.value = f * ratio;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(amp, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      osc.connect(g);
      g.connect(out);
      osc.start(t);
      osc.stop(t + dur + 0.05);
    }
  }

  /** Accord final, égrené. */
  bloom() {
    [0, 2, 3, 5, 7, 8, 10].forEach((s, i) => this.chime(s, 0.75, i * 0.07));
  }

  /** Froissement très léger (ouverture d'une carte, étoile filante). */
  whisper(gain = 1) {
    const ctx = this.ctx;
    if (!ctx || !this.enabled) return;
    const len = Math.floor(ctx.sampleRate * 0.5);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const bp = ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.frequency.value = 3200;
    bp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.value = 0.02 * gain;
    src.connect(bp);
    bp.connect(g);
    g.connect(this.master);
    src.start();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.music && !this.musicGain) this.music.muted = !on;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 1 : 0, t, 0.08);
    if (this.musicOut) {
      this.musicOut.gain.cancelScheduledValues(t);
      this.musicOut.gain.setTargetAtTime(on ? 1 : 0, t, 0.12);
    }
    if (on && this.ctx.state !== "running") void this.ctx.resume();
  }

  pause() {
    this.music?.pause();
    if (this.ctx && this.ctx.state === "running") void this.ctx.suspend();
  }

  resume() {
    if (this.musicOn && this.music) {
      const p = this.music.play();
      if (p) p.catch(() => {});
    }
    if (this.ctx && this.enabled && this.ctx.state !== "running") void this.ctx.resume();
  }
}

export const sound = new Sound();
