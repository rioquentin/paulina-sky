// Le dessin du lapin : l'icône « rabbit » de Lucide (https://lucide.dev, licence ISC),
// une icône conçue en traits, donc faite pour être tracée à la lumière.
// Elle est posée sur les étoiles par rotation + échelle uniforme : jamais déformée.
// Repère de l'icône : 24 × 24, y vers le bas, regard vers la droite.

export interface Part {
  d: string;
  /** Longueur approximative, utilisée si la mesure SVG échoue. */
  len: number;
  /** Début et durée du tracé, en fraction de l'animation. */
  start: number;
  dur: number;
  kind: "body" | "ear" | "tail" | "detail";
  /** Pivot pour les parties qui bougent. */
  pivot?: [number, number];
  path: Path2D;
  measure: SVGPathElement | null;
}

const RAW: Omit<Part, "path" | "measure">[] = [
  // le corps d'un seul geste : pattes, dos, oreille couchée, tête, poitrail
  { d: "M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3", len: 61, start: 0, dur: 0.62, kind: "body" },
  // l'oreille dressée
  { d: "M20 8.54V4a2 2 0 1 0-4 0v3", len: 13.8, start: 0.5, dur: 0.22, kind: "ear", pivot: [18, 8] },
  // la queue ronde
  { d: "M7.612 12.524a3 3 0 1 0-1.6 4.3", len: 14.5, start: 0.62, dur: 0.2, kind: "tail", pivot: [7.2, 14.7] },
  // la cuisse
  { d: "M13 16a3 3 0 0 1 2.24 5", len: 5.8, start: 0.74, dur: 0.16, kind: "detail" },
];

export const EYE: [number, number] = [18, 12];
export const GROUND: [number, number] = [12, 21];
export const HEART: [number, number] = [12.5, 13];

export function buildParts(): Part[] {
  return RAW.map((r) => {
    let measure: SVGPathElement | null = null;
    let len = r.len;
    try {
      measure = document.createElementNS("http://www.w3.org/2000/svg", "path");
      measure.setAttribute("d", r.d);
      const l = measure.getTotalLength();
      if (l > 0) len = l;
      else measure = null;
    } catch {
      measure = null;
    }
    return { ...r, len, path: new Path2D(r.d), measure };
  });
}

/** Gabarit (x à droite, y vers le haut, unité = 12 px d'icône) -> repère de l'icône. */
export const toIcon = (p: [number, number]): [number, number] => [p[0] * 12 + 12, 12 - p[1] * 12];

export interface Placement {
  /** Matrice canvas (a, b, c, d, e, f) : icône -> pixels CSS. */
  m: [number, number, number, number, number, number];
  scale: number;
}

/**
 * Meilleure similitude (rotation, échelle uniforme, miroir éventuel) qui amène
 * les points d'ancrage de l'icône sur les étoiles.
 */
export function placeOn(anchors: [number, number][], sx: number[], sy: number[]): Placement {
  const n = anchors.length;
  let mx = 0, my = 0, MX = 0, MY = 0;
  for (let i = 0; i < n; i++) {
    mx += anchors[i][0]; my += anchors[i][1];
    MX += sx[i]; MY += sy[i];
  }
  mx /= n; my /= n; MX /= n; MY /= n;
  let den = 0, a1 = 0, b1 = 0, a2 = 0, b2 = 0;
  for (let i = 0; i < n; i++) {
    const x = anchors[i][0] - mx, y = anchors[i][1] - my, X = sx[i] - MX, Y = sy[i] - MY;
    den += x * x + y * y;
    a1 += x * X + y * Y; b1 += x * Y - y * X; // sans miroir
    a2 += x * X - y * Y; b2 += x * Y + y * X; // avec miroir
  }
  // l'ajustement le plus fidèle est celui dont l'échelle est la plus grande
  const mirror = a2 * a2 + b2 * b2 > a1 * a1 + b1 * b1;
  const A = (mirror ? a2 : a1) / den, B = (mirror ? b2 : b1) / den;
  const m: Placement["m"] = mirror ? [A, B, B, -A, 0, 0] : [A, B, -B, A, 0, 0];
  m[4] = MX - (m[0] * mx + m[2] * my);
  m[5] = MY - (m[1] * mx + m[3] * my);
  return { m, scale: Math.hypot(A, B) };
}

export const apply = (p: Placement, x: number, y: number): [number, number] => [
  p.m[0] * x + p.m[2] * y + p.m[4],
  p.m[1] * x + p.m[3] * y + p.m[5],
];
