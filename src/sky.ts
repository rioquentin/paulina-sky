import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { bvToRgb, fromAltAz, horizontal, localSiderealDeg, moonState, type Vec3 } from "./astro";

export interface StarData {
  n: number;
  d: number[];
  c: string;
  names: Record<string, string>;
}

const RAD = Math.PI / 180;
const EXTRA = 16; // emplacements réservés (étoiles inventées du repli)
const FOV_K = 2 * Math.tan((48 * RAD) / 2); // demi-largeur visible : 48°
export const MOON_RADIUS_PX = 19;

const PROJECT_GLSL = /* glsl */ `
  uniform mat3 uView;
  uniform vec2 uScale;
  uniform vec2 uOffset;
  vec4 projectSky(vec3 dir) {
    vec3 v = uView * dir;
    vec2 p = 2.0 * v.xy / (1.0 + v.z);
    if (v.z < -0.55) return vec4(3.0, 3.0, 3.0, 1.0);
    return vec4(p * uScale + uOffset, 0.0, 1.0);
  }
`;

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.1031);
    p += dot(p, p.zyx + 31.32);
    return fract((p.x + p.y) * p.z);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
    return s;
  }
`;

const STAR_VERT = /* glsl */ `
  ${PROJECT_GLSL}
  attribute vec3 aColor;
  attribute vec3 aInfo; // magnitude, phase, état (0 normale, 1 pulse, 2 allumée)
  uniform float uTime, uPx, uDim, uReveal, uZoomSize, uCalm;
  uniform vec3 uMoon;
  uniform float uMoonPower;
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpike;
  varying float vScale;
  void main() {
    float mag = aInfo.x, phase = aInfo.y, state = aInfo.z;
    float special = step(0.5, state);
    float lit = step(1.5, state);
    gl_Position = projectSky(position);

    float magShown = mix(mag, min(mag, 2.4), special);
    float b = pow(10.0, -0.4 * magShown);
    float core = 0.72 + 3.1 * pow(b, 0.42);

    // scintillement : plus marqué près de l'horizon, comme en vrai
    float low = 1.0 - smoothstep(0.1, 0.75, position.z);
    float amp = mix(0.10, 0.30, low) * uCalm;
    float sp = 1.3 + phase * 2.2;
    float tw = sin(uTime * sp + phase * 40.0) * 0.6 + sin(uTime * sp * 2.37 + phase * 91.0) * 0.4;
    float twinkle = 1.0 + amp * tw * (1.0 - special);

    float pulse = 0.5 + 0.5 * sin(uTime * 1.7 + phase * 6.283);
    float sizeMul = mix(1.0, mix(1.25 + 0.45 * pulse * uCalm, 1.65, lit), special);

    float alpha = clamp(1.2 - 0.21 * mag, 0.07, 1.0);
    alpha = mix(alpha, mix(0.8 + 0.2 * pulse, 1.0, lit), special);

    // extinction près de l'horizon
    alpha *= smoothstep(0.07, 0.27, position.z);

    // la pleine Lune efface un peu les étoiles faibles autour d'elle
    float faint = smoothstep(1.8, 5.2, mag) * (1.0 - special);
    float ang = acos(clamp(dot(position, uMoon), -1.0, 1.0));
    float near = 1.0 - smoothstep(0.07, 0.6, ang);
    alpha *= 1.0 - uMoonPower * faint * (0.22 + 0.7 * near);
    // ... et masque celles qui sont derrière son disque
    alpha *= mix(1.0, smoothstep(0.02, 0.05, ang), step(0.01, uMoonPower));

    // apparition : les plus brillantes d'abord
    alpha *= smoothstep(0.0, 1.0, (mix(-2.5, 8.0, uReveal) - mag) * 0.9);

    alpha *= mix(uDim, 1.0, special);

    vColor = mix(aColor, vec3(1.0, 0.8, 0.52), lit * 0.75);
    vAlpha = alpha * twinkle;
    // aigrettes : les étoiles les plus brillantes, et celles du lapin
    vSpike = max(smoothstep(1.7, 0.0, mag) * 0.85, special * mix(0.5 + 0.25 * pulse, 1.0, lit));
    vScale = 1.0 + 1.5 * vSpike;
    gl_PointSize = core * 4.2 * uPx * sizeMul * uZoomSize * mix(1.0, twinkle, 0.35) * vScale;
  }
`;

const STAR_FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  varying float vSpike;
  varying float vScale;
  void main() {
    vec2 uv = (gl_PointCoord - 0.5) * 2.0 * vScale;
    float d = length(uv);
    // cœur net et serré, puis un halo discret
    float i = exp(-d * d * 34.0) + 0.34 * exp(-d * d * 11.0) + 0.1 * exp(-d * d * 3.2);
    i *= smoothstep(1.0, 0.55, d);
    // croix de lumière fine, qui s'éteint vers le bord
    vec2 a = abs(uv);
    float cross = exp(-a.y * 11.0) * exp(-a.x * 1.9) + exp(-a.x * 11.0) * exp(-a.y * 1.9);
    cross *= smoothstep(vScale, vScale * 0.45, max(a.x, a.y));
    i += cross * 0.3 * vSpike;
    gl_FragColor = vec4(vColor * i * vAlpha, 1.0);
    #include <colorspace_fragment>
  }
`;

const BG_VERT = /* glsl */ `
  void main() { gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

const BG_FRAG = /* glsl */ `
  uniform vec2 uRes, uCenter;
  uniform float uS, uTime, uReveal, uMoonPower, uDim;
  uniform vec3 uR, uU, uF, uMoon, uNgp, uGc, uGy;
  ${NOISE_GLSL}
  void main() {
    vec2 p = (gl_FragCoord.xy - uCenter) / uS;
    float r2 = dot(p, p);
    float k = 4.0 / (4.0 + r2);
    vec3 d = normalize(uR * (p.x * k) + uU * (p.y * k) + uF * ((4.0 - r2) / (4.0 + r2)));
    float alt = d.z;

    // dégradé : bleu nuit au zénith, violet sombre vers l'horizon
    float t = clamp(1.0 - alt, 0.0, 1.0);
    vec3 col = mix(vec3(0.027, 0.043, 0.122), vec3(0.058, 0.055, 0.165), smoothstep(0.0, 0.7, t));
    col = mix(col, vec3(0.125, 0.082, 0.205), pow(smoothstep(0.5, 1.0, t), 2.2));

    // Voie lactée, très douce
    vec3 g = vec3(dot(d, uGc), dot(d, uGy), dot(d, uNgp));
    float lat = asin(clamp(g.z, -1.0, 1.0));
    float band = exp(-pow(lat / 0.21, 2.0));
    float mw = 0.0;
    if (band > 0.015) { // le bruit n'est calculé que dans la bande
      float clouds = fbm(g * 3.4 + 2.0);
      float lanes = smoothstep(0.3, 0.62, fbm(g * 6.5 + 11.0));
      mw = band * (0.25 + 0.75 * clouds) * mix(0.45, 1.0, lanes);
    }
    float angM = acos(clamp(dot(d, uMoon), -1.0, 1.0));
    mw *= 1.0 - uMoonPower * 0.55 * (1.0 - smoothstep(0.1, 0.9, angM));
    mw *= smoothstep(0.05, 0.4, alt) * uReveal * mix(0.55, 1.0, uDim);
    col += vec3(0.30, 0.33, 0.50) * mw * 0.25;

    // halo de la Lune
    float glow = 0.30 * exp(-angM * 11.0) + 0.085 * exp(-angM * 2.8);
    col += vec3(0.55, 0.62, 0.86) * glow * uMoonPower * uReveal;

    // collines à l'horizon
    float az = atan(d.x, d.y);
    float hill = 0.034 + 0.026 * sin(az * 3.0 + 1.3) + 0.012 * sin(az * 7.3 + 0.4) + 0.006 * sin(az * 17.0);
    vec3 ground = mix(vec3(0.040, 0.030, 0.072), vec3(0.020, 0.016, 0.040), smoothstep(0.02, -0.35, alt));
    col = mix(col, ground, smoothstep(hill + 0.006, hill - 0.004, alt));

    // tramage contre les bandes dans les dégradés sombres
    float n = fract(sin(dot(gl_FragCoord.xy, vec2(12.9898, 78.233))) * 43758.5453);
    col += (n - 0.5) * (1.6 / 255.0);

    gl_FragColor = vec4(pow(max(col, 0.0), vec3(2.2)), 1.0);
    #include <colorspace_fragment>
  }
`;

const MOON_VERT = /* glsl */ `
  ${PROJECT_GLSL}
  uniform float uSize;
  void main() {
    gl_Position = projectSky(position);
    gl_PointSize = uSize;
  }
`;

const MOON_FRAG = /* glsl */ `
  uniform float uReveal, uPhase;
  ${NOISE_GLSL}
  void main() {
    vec2 uv = (gl_PointCoord - 0.5) * 2.0;
    uv.y = -uv.y;
    float r = length(uv) / 0.86;
    if (r > 1.08) discard;
    float z = sqrt(max(0.0, 1.0 - r * r));
    // mers lunaires
    float m = fbm(vec3(uv * 2.3 + vec2(3.1, 1.7), 4.0));
    float m2 = fbm(vec3(uv * 5.5, 9.0));
    float albedo = mix(0.6, 1.0, smoothstep(0.36, 0.62, m)) * (0.95 + 0.1 * m2);
    // phase : terminateur réaliste si la Lune n'est pas pleine
    float lit = 1.0;
    if (uPhase < 0.97) {
      float yy = uv.y / 0.86;
      float xt = (1.0 - 2.0 * uPhase) * sqrt(max(0.0, 1.0 - yy * yy));
      lit = smoothstep(xt - 0.07, xt + 0.07, uv.x / 0.86);
    }
    vec3 col = vec3(1.0, 0.98, 0.93) * albedo * (0.8 + 0.2 * z) * mix(0.05, 1.0, lit);
    float a = smoothstep(1.03, 0.97, r) * uReveal;
    gl_FragColor = vec4(pow(col * 0.8, vec3(2.2)), a);
    #include <colorspace_fragment>
  }
`;

export class Sky {
  readonly renderer: THREE.WebGLRenderer;
  readonly n: number;
  readonly dirs: Float32Array; // vecteurs horizontaux (x est, y nord, z zénith)
  readonly mags: Float32Array;
  readonly moon: { dir: Vec3; fraction: number; altitudeDeg: number };
  readonly moonVisible: boolean;

  /** Vue : centre (az, alt) en degrés + zoom. */
  view = { az: 180, alt: 72, zoom: 1 };
  /** Décalage du centre de projection, en pixels CSS (y vers le bas). */
  offset = { x: 0, y: 0 };
  pan = { x: 0, y: 0 };
  tilt = { x: 0, y: 0 };
  dim = 1;
  reveal = 0;
  calm = 1;
  bloomOn = true;

  width = 1;
  height = 1;
  private S = 1;
  private R = new THREE.Vector3();
  private U = new THREE.Vector3();
  private F = new THREE.Vector3();
  private viewMat = new THREE.Matrix3();
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private composer: EffectComposer;
  private bloom: UnrealBloomPass;
  private starMat: THREE.ShaderMaterial;
  private bgMat: THREE.ShaderMaterial;
  private moonMat: THREE.ShaderMaterial;
  private infoAttr: THREE.BufferAttribute;
  private posAttr: THREE.BufferAttribute;
  private colAttr: THREE.BufferAttribute;
  private used: number;
  private pxRatio = 1;
  private maxRatio = 2;

  constructor(
    private canvas: HTMLCanvasElement,
    data: StarData,
    place: { date: Date; lat: number; lon: number },
  ) {
    const lst = localSiderealDeg(place.date, place.lon);
    const total = data.n + EXTRA;
    this.n = data.n;
    this.used = data.n;
    this.dirs = new Float32Array(total * 3);
    this.mags = new Float32Array(total);
    const colors = new Float32Array(total * 3);
    const info = new Float32Array(total * 3);
    // générateur déterministe : le ciel est identique à chaque visite
    let seed = 20051116;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
    for (let i = 0; i < data.n; i++) {
      const ra = data.d[i * 4] / 100, dec = data.d[i * 4 + 1] / 100;
      const mag = data.d[i * 4 + 2] / 100, bv = data.d[i * 4 + 3] / 100;
      const v = horizontal(ra, dec, lst, place.lat);
      this.dirs.set(v, i * 3);
      this.mags[i] = mag;
      colors.set(bvToRgb(bv), i * 3);
      info[i * 3] = mag;
      info[i * 3 + 1] = rnd();
      info[i * 3 + 2] = 0;
    }
    for (let i = data.n; i < total; i++) {
      this.dirs.set([0, 0, -1], i * 3);
      this.mags[i] = 99;
      info[i * 3] = 99;
    }

    this.moon = moonState(place.date, place.lat, place.lon, lst);
    this.moonVisible = this.moon.altitudeDeg > 6;
    // cadrage : légèrement vers le sud, ou tourné pour garder la Lune dans le champ
    if (this.moon.altitudeDeg > 15) {
      let az = (Math.atan2(this.moon.dir[0], this.moon.dir[1]) / RAD + 360) % 360;
      az += az < 180 ? 30 : -30;
      this.view.az = Math.max(110, Math.min(250, az));
    }
    const moonPower = this.moonVisible ? Math.pow(this.moon.fraction, 1.5) : 0;

    const ngp = horizontal(192.859, 27.128, lst, place.lat);
    const gc = horizontal(266.405, -28.936, lst, place.lat);
    const vNgp = new THREE.Vector3(...ngp);
    const vGc = new THREE.Vector3(...gc);
    const vGy = new THREE.Vector3().crossVectors(vNgp, vGc).normalize();

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer.setClearColor(0x05060f, 1);

    const shared = { uView: { value: this.viewMat }, uScale: { value: new THREE.Vector2(1, 1) }, uOffset: { value: new THREE.Vector2(0, 0) } };

    // fond : dégradé + Voie lactée + halo lunaire
    this.bgMat = new THREE.ShaderMaterial({
      vertexShader: BG_VERT,
      fragmentShader: BG_FRAG,
      depthTest: false,
      depthWrite: false,
      uniforms: {
        uRes: { value: new THREE.Vector2(1, 1) },
        uCenter: { value: new THREE.Vector2(0, 0) },
        uS: { value: 1 },
        uTime: { value: 0 },
        uReveal: { value: 0 },
        uDim: { value: 1 },
        uMoonPower: { value: moonPower },
        uR: { value: this.R },
        uU: { value: this.U },
        uF: { value: this.F },
        uMoon: { value: new THREE.Vector3(...this.moon.dir) },
        uNgp: { value: vNgp },
        uGc: { value: vGc },
        uGy: { value: vGy },
      },
    });
    const bg = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.bgMat);
    bg.frustumCulled = false;
    bg.renderOrder = 0;
    this.scene.add(bg);

    // étoiles
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.dirs, 3);
    this.colAttr = new THREE.BufferAttribute(colors, 3);
    this.infoAttr = new THREE.BufferAttribute(info, 3);
    geo.setAttribute("position", this.posAttr);
    geo.setAttribute("aColor", this.colAttr);
    geo.setAttribute("aInfo", this.infoAttr);
    this.starMat = new THREE.ShaderMaterial({
      vertexShader: STAR_VERT,
      fragmentShader: STAR_FRAG,
      blending: THREE.AdditiveBlending,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: {
        ...shared,
        uTime: { value: 0 },
        uPx: { value: 1 },
        uDim: { value: 1 },
        uReveal: { value: 0 },
        uZoomSize: { value: 1 },
        uCalm: { value: 1 },
        uMoon: { value: new THREE.Vector3(...this.moon.dir) },
        uMoonPower: { value: moonPower },
      },
    });
    const stars = new THREE.Points(geo, this.starMat);
    stars.frustumCulled = false;
    stars.renderOrder = 1;
    this.scene.add(stars);

    // Lune
    const moonGeo = new THREE.BufferGeometry();
    moonGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.moon.dir), 3));
    this.moonMat = new THREE.ShaderMaterial({
      vertexShader: MOON_VERT,
      fragmentShader: MOON_FRAG,
      depthTest: false,
      depthWrite: false,
      transparent: true,
      uniforms: { ...shared, uSize: { value: 32 }, uReveal: { value: 0 }, uPhase: { value: this.moon.fraction } },
    });
    const moon = new THREE.Points(moonGeo, this.moonMat);
    moon.frustumCulled = false;
    moon.renderOrder = 2;
    moon.visible = this.moonVisible;
    this.scene.add(moon);

    this.composer = new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.42, 0.4, 0.36);
    this.composer.addPass(this.bloom);
    this.composer.addPass(new OutputPass());

    this.resize();
  }

  /** Pixels CSS par unité du plan de projection. */
  get scale() {
    return this.S;
  }

  get starCount() {
    return this.used;
  }

  /** Ajoute une étoile inventée (repli du lapin). Renvoie son indice. */
  addStar(dir: Vec3, mag: number, bv: number): number {
    const i = this.used++;
    this.dirs.set(dir, i * 3);
    this.mags[i] = mag;
    (this.colAttr.array as Float32Array).set(bvToRgb(bv), i * 3);
    const info = this.infoAttr.array as Float32Array;
    info[i * 3] = mag;
    info[i * 3 + 1] = (i * 0.618034) % 1;
    info[i * 3 + 2] = 0;
    this.posAttr.needsUpdate = true;
    this.colAttr.needsUpdate = true;
    this.infoAttr.needsUpdate = true;
    return i;
  }

  /** 0 = normale, 1 = pulse (à trouver), 2 = allumée. */
  setState(index: number, state: number) {
    (this.infoAttr.array as Float32Array)[index * 3 + 2] = state;
    this.infoAttr.needsUpdate = true;
  }

  dir(index: number): Vec3 {
    return [this.dirs[index * 3], this.dirs[index * 3 + 1], this.dirs[index * 3 + 2]];
  }

  setMaxPixelRatio(r: number) {
    this.maxRatio = r;
    this.resize();
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.width = w;
    this.height = h;
    // au moins 2× même sur un écran 1× : le rendu est suréchantillonné, donc plus net
    this.pxRatio = Math.min(Math.max(window.devicePixelRatio || 1, 2), this.maxRatio);
    this.renderer.setPixelRatio(this.pxRatio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(this.pxRatio);
    this.composer.setSize(w, h);
    this.bgMat.uniforms.uRes.value.set(w * this.pxRatio, h * this.pxRatio);
    this.starMat.uniforms.uPx.value = this.pxRatio;
    this.moonMat.uniforms.uSize.value = (MOON_RADIUS_PX * 2 * this.pxRatio) / 0.86;
  }

  /** Recalcule la base de la vue (à appeler avant project() ou render()). */
  updateView() {
    const az = this.view.az + this.pan.x + this.tilt.x;
    const alt = Math.max(30, Math.min(86, this.view.alt + this.pan.y + this.tilt.y));
    const f = fromAltAz(alt, az);
    this.F.set(f[0], f[1], f[2]);
    this.R.set(this.F.y, -this.F.x, 0).normalize(); // F × zénith : l'ouest à droite quand on regarde le sud
    this.U.crossVectors(this.R, this.F).normalize();
    this.viewMat.set(this.R.x, this.R.y, this.R.z, this.U.x, this.U.y, this.U.z, this.F.x, this.F.y, this.F.z);
    this.S = (Math.min(this.width, this.height) / 2 / FOV_K) * this.view.zoom;
    (this.starMat.uniforms.uScale.value as THREE.Vector2).set((2 * this.S) / this.width, (2 * this.S) / this.height);
    (this.starMat.uniforms.uOffset.value as THREE.Vector2).set((2 * this.offset.x) / this.width, (-2 * this.offset.y) / this.height);
    (this.bgMat.uniforms.uCenter.value as THREE.Vector2).set((this.width / 2 + this.offset.x) * this.pxRatio, (this.height / 2 - this.offset.y) * this.pxRatio);
  }

  /** Direction du ciel -> position écran en pixels CSS. */
  project(d: Vec3): { x: number; y: number; visible: boolean } {
    const vx = d[0] * this.R.x + d[1] * this.R.y + d[2] * this.R.z;
    const vy = d[0] * this.U.x + d[1] * this.U.y + d[2] * this.U.z;
    const vz = d[0] * this.F.x + d[1] * this.F.y + d[2] * this.F.z;
    const k = 2 / (1 + vz);
    return { x: this.width / 2 + this.offset.x + vx * k * this.S, y: this.height / 2 + this.offset.y - vy * k * this.S, visible: vz > -0.5 };
  }

  /** Coordonnées dans le plan de projection, indépendantes de l'écran. */
  plane(d: Vec3): [number, number] {
    const vx = d[0] * this.R.x + d[1] * this.R.y + d[2] * this.R.z;
    const vy = d[0] * this.U.x + d[1] * this.U.y + d[2] * this.U.z;
    const vz = d[0] * this.F.x + d[1] * this.F.y + d[2] * this.F.z;
    const k = 2 / (1 + vz);
    return [vx * k, vy * k];
  }

  /** Inverse de plane(). */
  fromPlane(px: number, py: number): Vec3 {
    const r2 = px * px + py * py;
    const k = 4 / (4 + r2);
    const z = (4 - r2) / (4 + r2);
    return [
      this.R.x * px * k + this.U.x * py * k + this.F.x * z,
      this.R.y * px * k + this.U.y * py * k + this.F.y * z,
      this.R.z * px * k + this.U.z * py * k + this.F.z * z,
    ];
  }

  render(time: number) {
    this.updateView();
    const su = this.starMat.uniforms;
    su.uTime.value = time;
    su.uDim.value = this.dim;
    su.uReveal.value = this.reveal;
    su.uCalm.value = this.calm;
    su.uZoomSize.value = Math.sqrt(this.view.zoom);
    const bu = this.bgMat.uniforms;
    bu.uS.value = this.S * this.pxRatio;
    bu.uTime.value = time;
    bu.uReveal.value = this.reveal;
    bu.uDim.value = this.dim;
    this.moonMat.uniforms.uReveal.value = Math.min(1, this.reveal * 2.5);
    this.moonMat.uniforms.uSize.value = ((MOON_RADIUS_PX * 2 * this.pxRatio) / 0.86) * Math.sqrt(this.view.zoom);
    if (this.bloomOn) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}
