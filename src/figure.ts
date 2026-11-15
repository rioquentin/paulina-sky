// Le dessin du lapin : l'icône « rabbit » de Hugeicons (https://hugeicons.com, jeu gratuit, licence MIT),
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
  /** Amplitude et sens du mouvement autour du pivot. */
  amp?: number;
  path: Path2D;
  measure: SVGPathElement | null;
}

const RAW: Omit<Part, "path" | "measure">[] = [
  // la tête et le corps d'un seul geste
  { d: "M17.072 8.96a2.346 2.346 0 0 0-2.485 1.59l-.179.537a.432.432 0 0 1-.715.17a1.73 1.73 0 0 0-1.221-.507h-2.035c-.232 0-.348 0-.446.004a5 5 0 0 0-4.8 4.8c-.004.098-.004.214-.004.446s0 .349.004.447a5 5 0 0 0 4.8 4.8c.098.003.214.003.446.003h7.25a1.5 1.5 0 0 0 1.5-1.5v-.319a1.18 1.18 0 0 0-1.18-1.18a.59.59 0 0 1-.56-.778l.433-1.3c.076-.229.114-.343.17-.437a1 1 0 0 1 .642-.462c.106-.024.227-.024.467-.024h.177c.212 0 .318 0 .417-.01a2 2 0 0 0 1.406-.796c.06-.08.114-.17.223-.352c.125-.209.188-.313.235-.415a2 2 0 0 0-.072-1.804a5 5 0 0 0-.267-.396l-.655-.916a6 6 0 0 0-.315-.422a3 3 0 0 0-1.7-.998a7 7 0 0 0-.522-.069z", len: 58, start: 0, dur: 0.56, kind: "body" },
  // l'oreille arrière
  { d: "M15.687 9.25l-.109-.763a5 5 0 0 0-2.616-3.847c-.059-.032-.122-.063-.248-.126c-.07-.035-.105-.053-.13-.064a1 1 0 0 0-1.395.862c-.002.028-.002.067-.002.146v.13c0 .313 0 .47.009.619a5 5 0 0 0 1.566 3.344c.11.103.23.203.47.403l.955.796", len: 16.5, start: 0.44, dur: 0.2, kind: "ear", pivot: [14.9, 9.9], amp: -0.06 },
  // l'oreille avant, dressée
  { d: "M14.19 5.462a4.5 4.5 0 0 1 .211-1.518l.16-.5c.221-.69 1.154-.924 1.727-.434l.224.191c1.239 1.06 1.846 2.601 1.633 4.143L17.95 8.75", len: 11.5, start: 0.54, dur: 0.2, kind: "ear", pivot: [16.2, 8.7], amp: 0.13 },
  // la queue en pompon
  { d: "M5.187 14.518a2 2 0 1 0 0 3.465", len: 6.3, start: 0.66, dur: 0.16, kind: "tail", pivot: [5.6, 16.25], amp: 0.22 },
  // la cuisse
  { d: "M11.187 21.25a3 3 0 1 0 0-6", len: 9.4, start: 0.74, dur: 0.16, kind: "detail" },
];

export const EYE: [number, number] = [18.187, 11.75];
export const GROUND: [number, number] = [12, 21.25];
export const HEART: [number, number] = [12, 14];

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
