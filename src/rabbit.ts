import type { Sky } from "./sky";
import type { Vec3 } from "./astro";

type P = [number, number];

export interface Rabbit {
  /** Indices d'étoiles dans le ciel, dans l'ordre des messages. */
  stars: number[];
  /** Traits, dans l'ordre où ils se dessinent (indices dans `stars`). */
  segments: [number, number][];
  /** Traits qui sont des oreilles (indices dans `segments`). */
  ears: number[];
  /** L'œil : trois étoiles de la tête et leurs poids. */
  eye: { at: [number, number, number]; w: [number, number, number] };
  /** Position de la queue (indice dans `stars`). */
  tail: number;
  /** true = vraies étoiles ; false = points inventés (repli). */
  real: boolean;
  /** Écart maximal au gabarit, en fraction de la taille du lapin. */
  deviation: number;
  center: Vec3;
  /** Rayon angulaire (radians). */
  radius: number;
}

/**
 * Gabarit : lapin assis de profil, regard vers la gauche (x à droite, y vers le haut).
 * L'ordre des points est celui des messages.
 */
function template(n: number) {
  const pts: Record<string, P> = {
    museau: [-0.58, 0.3],
    front: [-0.3, 0.56],
    oreilleG: [-0.37, 1.0],
    nuque: [-0.09, 0.52],
    oreilleD: [0.03, 0.98],
    echine: [0.16, 0.42],
    dos: [0.44, 0.2],
    queue: [0.7, -0.26],
    patteArr: [0.36, -0.5],
    ventre: [0.04, -0.5],
    patteAv: [-0.26, -0.5],
    gorge: [-0.28, 0.14],
  };
  // de 8 à 12 points selon le nombre de messages
  const order = ["museau", "front", "oreilleG", "nuque", "oreilleD", "echine", "dos", "queue", "patteArr", "ventre", "patteAv", "gorge"];
  const drop: string[] = [];
  if (n <= 11) drop.push("ventre");
  if (n <= 10) drop.push("echine");
  if (n <= 9) drop.push("gorge");
  if (n <= 8) drop.push("nuque");
  const names = order.filter((k) => !drop.includes(k));
  const idx = (k: string) => names.indexOf(k);
  const has = (k: string) => idx(k) >= 0;
  const earBaseD = has("nuque") ? "nuque" : "front";
  const outline = ["museau", "front", "nuque", "echine", "dos", "queue", "patteArr", "ventre", "patteAv", "gorge"].filter(has);
  const segs: [string, string][] = [];
  const ears: number[] = [];
  // museau -> front, oreille gauche, front -> nuque, oreille droite, puis le reste du contour
  segs.push([outline[0], outline[1]]);
  ears.push(segs.length);
  segs.push(["front", "oreilleG"]);
  if (has("nuque")) segs.push(["front", "nuque"]);
  ears.push(segs.length);
  segs.push([earBaseD, "oreilleD"]);
  for (let i = has("nuque") ? 2 : 1; i < outline.length; i++) {
    segs.push([outline[i], outline[(i + 1) % outline.length]]);
  }
  return {
    points: names.map((k) => pts[k]),
    segments: segs.map(([a, b]) => [idx(a), idx(b)] as [number, number]),
    ears,
    tail: idx("queue"),
    eye: has("gorge")
      ? { at: [idx("museau"), idx("front"), idx("gorge")] as [number, number, number], w: [0.4, 0.38, 0.22] as [number, number, number] }
      : { at: [idx("museau"), idx("front"), idx("patteAv")] as [number, number, number], w: [0.46, 0.42, 0.12] as [number, number, number] },
  };
}

export function messageCount(n: number) {
  return Math.max(8, Math.min(12, n));
}

/**
 * Cherche, parmi les vraies étoiles visibles, celles qui dessinent le mieux le lapin
 * dans une zone dégagée du ciel (vue par défaut). Repli sur des points inventés
 * si la forme obtenue est trop déformée.
 */
export function findRabbit(sky: Sky, count: number): Rabbit {
  const n = messageCount(count);
  const tpl = template(n);
  sky.updateView();

  const moon = sky.moon.dir;
  const moonOn = sky.moonVisible;
  const cand: { i: number; x: number; y: number; mag: number }[] = [];
  for (let i = 0; i < sky.n; i++) {
    const mag = sky.mags[i];
    if (mag > 5.0) continue;
    const d = sky.dir(i);
    if (d[2] < 0.42) continue; // au moins ~25° au-dessus de l'horizon
    if (moonOn && d[0] * moon[0] + d[1] * moon[1] + d[2] * moon[2] > Math.cos(0.17)) continue;
    const [x, y] = sky.plane(d);
    if (Math.abs(x) > 0.8 || y > 1.22 || y < -1.0) continue;
    cand.push({ i, x, y, mag });
  }

  // grille spatiale pour trouver vite l'étoile la plus proche
  const CELL = 0.09;
  const grid = new Map<number, number[]>();
  const key = (cx: number, cy: number) => cx * 1000 + cy;
  cand.forEach((c, k) => {
    const id = key(Math.floor(c.x / CELL), Math.floor(c.y / CELL));
    const cell = grid.get(id);
    if (cell) cell.push(k);
    else grid.set(id, [k]);
  });
  const nearest = (x: number, y: number) => {
    const cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
    let best = -1, bd = Infinity;
    for (let a = -1; a <= 1; a++)
      for (let b = -1; b <= 1; b++) {
        const cell = grid.get(key(cx + a, cy + b));
        if (!cell) continue;
        for (const k of cell) {
          const dx = cand[k].x - x, dy = cand[k].y - y;
          const d2 = dx * dx + dy * dy;
          // à distance égale, on préfère une étoile plus brillante
          const w = d2 * (1 + Math.max(0, cand[k].mag - 3) * 0.12);
          if (w < bd) { bd = w; best = k; }
        }
      }
    return best;
  };

  const [mx, my] = moonOn ? sky.plane(moon) : [99, 99];
  let best: { cost: number; picks: number[]; dev: number } | null = null;
  const picks = new Array<number>(n);
  for (const mirror of [1, -1])
    for (let rot = -18; rot <= 18; rot += 6) {
      const cr = Math.cos((rot * Math.PI) / 180), sr = Math.sin((rot * Math.PI) / 180);
      for (let s = 0.4; s <= 0.6; s += 0.05)
        for (let cx = -0.5; cx <= 0.5; cx += 0.04)
          for (let cy = -0.7; cy <= 0.9; cy += 0.04) {
            let cost = 0, dev = 0, ok = true;
            for (let p = 0; p < n && ok; p++) {
              const tx = tpl.points[p][0] * mirror, ty = tpl.points[p][1] - 0.25;
              const x = cx + (tx * cr - ty * sr) * s, y = cy + (tx * sr + ty * cr) * s;
              if (Math.abs(x) > 0.78 || y > 1.2 || y < -0.98) { ok = false; break; }
              const k = nearest(x, y);
              if (k < 0) { ok = false; break; }
              for (let q = 0; q < p; q++) if (picks[q] === k) ok = false;
              picks[p] = k;
              const dx = (cand[k].x - x) / s, dy = (cand[k].y - y) / s;
              const d2 = dx * dx + dy * dy;
              cost += d2;
              dev = Math.max(dev, Math.sqrt(d2));
            }
            if (!ok) continue;
            cost = cost / n + dev * dev * 0.5;
            // on évite que la Lune tombe au milieu du lapin
            const dm = Math.hypot(cx - mx, cy - my) / s;
            if (dm < 1.0) cost += (1.0 - dm) * 0.02;
            cost -= s * 0.004; // à qualité égale, un lapin plus grand
            if (!best || cost < best.cost) best = { cost, picks: picks.slice(), dev };
          }
    }

  let stars: number[];
  let real = true;
  let deviation = best ? best.dev : 1;
  if (best && best.dev <= 0.125) {
    stars = best.picks.map((k) => cand[k].i);
  } else {
    // repli : points inventés, à l'endroit le plus loin de la Lune
    real = false;
    deviation = 0;
    const s = 0.5;
    const cx = mx > 0 ? -0.22 : 0.22;
    const cy = my > 0.2 ? -0.25 : 0.45;
    stars = tpl.points.map(([tx, ty], p) => {
      const jitter = ((p * 37) % 7) / 7 - 0.5;
      const dir = sky.fromPlane(cx + tx * s + jitter * 0.012, cy + (ty - 0.25) * s - jitter * 0.01);
      return sky.addStar(dir, 3.2 + (p % 3) * 0.3, 0.2 + (p % 4) * 0.2);
    });
  }

  // centre de la boîte englobante plutôt que barycentre : meilleur cadrage
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const i of stars) {
    const [x, y] = sky.plane(sky.dir(i));
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const center = sky.fromPlane((minX + maxX) / 2, (minY + maxY) / 2);
  let radius = 0;
  for (const i of stars) {
    const d = sky.dir(i);
    radius = Math.max(radius, Math.acos(Math.min(1, d[0] * center[0] + d[1] * center[1] + d[2] * center[2])));
  }

  return { stars, segments: tpl.segments, ears: tpl.ears, tail: tpl.tail, eye: tpl.eye, real, deviation, center, radius };
}
