import { Body, Equator, Illumination, Observer, SiderealTime } from "astronomy-engine";

const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

/** Heure locale (dans un fuseau IANA) -> instant UTC. */
export function localToUtc(date: string, time: string, tz: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const target = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  let guess = target;
  for (let i = 0; i < 3; i++) {
    const p: Record<string, number> = {};
    for (const part of fmt.formatToParts(new Date(guess))) {
      if (part.type !== "literal") p[part.type] = Number(part.value);
    }
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
    guess -= shown - target;
  }
  return new Date(guess);
}

/** Temps sidéral local, en degrés. */
export function localSiderealDeg(date: Date, lon: number): number {
  return SiderealTime(date) * 15 + lon;
}

/**
 * Coordonnées équatoriales -> vecteur unitaire horizontal.
 * x = est, y = nord, z = zénith.
 */
export function horizontal(raDeg: number, decDeg: number, lstDeg: number, latDeg: number): Vec3 {
  const H = (lstDeg - raDeg) * RAD;
  const dec = decDeg * RAD;
  const lat = latDeg * RAD;
  const cd = Math.cos(dec), sd = Math.sin(dec);
  const cl = Math.cos(lat), sl = Math.sin(lat);
  const cH = Math.cos(H);
  return [-cd * Math.sin(H), sd * cl - cd * sl * cH, sd * sl + cd * cl * cH];
}

export function moonState(date: Date, lat: number, lon: number, lstDeg: number) {
  const obs = new Observer(lat, lon, 0);
  const eq = Equator(Body.Moon, date, obs, true, true);
  const dir = horizontal(eq.ra * 15, eq.dec, lstDeg, lat);
  const illum = Illumination(Body.Moon, date);
  return { dir, fraction: illum.phase_fraction, altitudeDeg: Math.asin(dir[2]) / RAD };
}

export function altAz(dir: Vec3) {
  const alt = Math.asin(dir[2]) / RAD;
  let az = Math.atan2(dir[0], dir[1]) / RAD;
  if (az < 0) az += 360;
  return { alt, az };
}

export function fromAltAz(altDeg: number, azDeg: number): Vec3 {
  const a = altDeg * RAD, z = azDeg * RAD;
  return [Math.cos(a) * Math.sin(z), Math.cos(a) * Math.cos(z), Math.sin(a)];
}

/** Indice de couleur B-V -> RGB (0..1), volontairement désaturé. */
export function bvToRgb(bv: number): Vec3 {
  const stops: [number, Vec3][] = [
    [-0.35, [0.6, 0.7, 1.0]],
    [0.0, [0.79, 0.86, 1.0]],
    [0.35, [0.97, 0.97, 1.0]],
    [0.65, [1.0, 0.96, 0.86]],
    [1.0, [1.0, 0.87, 0.7]],
    [1.5, [1.0, 0.76, 0.55]],
    [2.0, [1.0, 0.66, 0.45]],
  ];
  const t = Math.max(stops[0][0], Math.min(stops[stops.length - 1][0], bv));
  let i = 0;
  while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
  const [a, ca] = stops[i];
  const [b, cb] = stops[i + 1];
  const k = (t - a) / (b - a);
  const mixWhite = 0.25;
  return [0, 1, 2].map((j) => {
    const c = ca[j] + (cb[j] - ca[j]) * k;
    return c + (1 - c) * mixWhite;
  }) as Vec3;
}
