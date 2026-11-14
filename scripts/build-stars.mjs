// Prétraitement du catalogue HYG -> public/stars.json (compact).
// Usage : node scripts/build-stars.mjs [chemin/vers/hyg.csv]
// Sans argument, le CSV est téléchargé dans data-cache/hyg/ (non commité).
import { readFile, writeFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCES = [
  "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/CURRENT/hygdata_v41.csv",
  "https://raw.githubusercontent.com/astronexus/HYG-Database/main/hyg/v3/hyg_v38.csv",
  "https://codeberg.org/astronexus/hyg/raw/branch/main/data/hyg/CURRENT/hyg_v42.csv",
];
const MAG_MAX = 6.0;

async function exists(p) {
  try { await stat(p); return true; } catch { return false; }
}

async function obtainCsv() {
  if (process.argv[2]) return readFile(resolve(process.argv[2]), "utf8");
  const cache = resolve(root, "data-cache/hyg/hyg.csv");
  if (await exists(cache)) return readFile(cache, "utf8");
  await mkdir(dirname(cache), { recursive: true });
  for (const url of SOURCES) {
    try {
      console.log("Téléchargement :", url);
      const res = await fetch(url);
      if (!res.ok) { console.log("  ->", res.status); continue; }
      const text = await res.text();
      if (!/\bra\b/.test(text.slice(0, 600)) || text.length < 1e6) { console.log("  -> contenu inattendu"); continue; }
      await writeFile(cache, text);
      return text;
    } catch (e) {
      console.log("  -> échec :", e.message);
    }
  }
  throw new Error("Impossible de récupérer le catalogue HYG.");
}

function parseLine(line) {
  const out = [];
  let cur = "", q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

const csv = await obtainCsv();
const lines = csv.split(/\r?\n/).filter(Boolean);
const head = parseLine(lines[0]).map((h) => h.trim().toLowerCase());
const col = (n) => {
  const i = head.indexOf(n);
  if (i < 0) throw new Error("Colonne absente : " + n);
  return i;
};
const iRa = col("ra"), iDec = col("dec"), iMag = col("mag"), iCi = col("ci");
const iProper = col("proper"), iCon = col("con"), iDist = col("dist");

const stars = [];
for (let k = 1; k < lines.length; k++) {
  const f = parseLine(lines[k]);
  const mag = parseFloat(f[iMag]);
  if (!Number.isFinite(mag) || mag > MAG_MAX) continue;
  if (f[iProper] === "Sol" || parseFloat(f[iDist]) === 0) continue;
  const ra = parseFloat(f[iRa]) * 15; // heures -> degrés
  const dec = parseFloat(f[iDec]);
  if (!Number.isFinite(ra) || !Number.isFinite(dec)) continue;
  let bv = parseFloat(f[iCi]);
  if (!Number.isFinite(bv)) bv = 0.6;
  stars.push({ ra, dec, mag, bv, con: (f[iCon] || "").trim(), proper: (f[iProper] || "").trim() });
}
stars.sort((a, b) => a.mag - b.mag);

// Format : d = [ra*100, dec*100, mag*100, bv*100, ...] (entiers), c = codes de constellation,
// names = { index: nom propre } pour les étoiles qui en ont un.
const d = [];
const cons = [];
const names = {};
stars.forEach((s, i) => {
  d.push(Math.round(s.ra * 100), Math.round(s.dec * 100), Math.round(s.mag * 100), Math.round(s.bv * 100));
  cons.push(s.con.padEnd(3, " ").slice(0, 3));
  if (s.proper) names[i] = s.proper;
});
const out = resolve(root, "public/stars.json");
await mkdir(dirname(out), { recursive: true });
const json = JSON.stringify({ n: stars.length, d, c: cons.join(""), names });
await writeFile(out, json);
console.log(`${stars.length} étoiles (mag <= ${MAG_MAX}) -> public/stars.json, ${(json.length / 1024).toFixed(0)} Ko`);
console.log("Les plus brillantes :", stars.slice(0, 8).map((s) => `${s.proper || "?"} ${s.mag}`).join(", "));
