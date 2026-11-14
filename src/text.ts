/** "2005-11-16" -> « 16 novembre 2005 » (et « 1er » pour le premier du mois). */
export function dateFr(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const s = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    new Date(Date.UTC(y, m - 1, d, 12)),
  );
  return s.replace(/^1 /, "1er ");
}

/** « au-dessus de Toulouse », « d’Angers », « du Mans », « des Sables-d’Olonne ». */
export function auDessusDe(ville: string): string {
  if (/^Le\s/.test(ville)) return "au-dessus du " + ville.slice(3);
  if (/^Les\s/.test(ville)) return "au-dessus des " + ville.slice(4);
  if (/^[aeiouyhâàéèêîôûœ]/i.test(ville)) return "au-dessus d’" + ville;
  return "au-dessus de " + ville;
}
