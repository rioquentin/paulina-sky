// ─────────────────────────────────────────────────────────────
//  TOUT le contenu personnel est ici. Rien d'autre à modifier.
//  Le site est en anglais : tous les textes ci-dessous aussi.
//  Après un changement : `npm run deploy`.
// ─────────────────────────────────────────────────────────────
export const content = {
  prenom: "Name", // ← à remplacer

  naissance: {
    date: "2005-11-16",
    heure: "23:00", // si inconnue : laisser "23:00" (ciel de nuit)
    ville: "Solingen",
    lat: 51.1652, // coordonnées de la ville
    lon: 7.0671,
    fuseau: "Europe/Berlin",
  },

  // Un message par étoile, dans l'ordre où elle les découvre. 8 à 12 messages possibles.
  messages: [
    "Message 1 — to replace.",
    "Message 2 — to replace.",
    "Message 3 — to replace.",
    "Message 4 — to replace.",
    "Message 5 — to replace.",
    "Message 6 — to replace.",
    "Message 7 — to replace.",
    "Message 8 — to replace.",
    "Message 9 — to replace.",
    "Message 10 — to replace.",
  ],

  // Petit mot quand elle touche la Lune (laisser "" pour désactiver).
  messageLune: "The night you were born, the Moon was full.",

  messageFinal: "Final message — to replace.",
  signature: "Signature",

  // Textes d'interface (modifiables aussi).
  ui: {
    intro1: "The sky of {date},", // {date} = date de naissance
    intro2: "above {ville}.", // {ville} = ville de naissance
    commencer: "Touch to begin",
    indice: "One star shines brighter than the others…",
    joyeux: "Happy birthday",
    revoir: "See the sky again",
    constellation: "the Rabbit", // légende sous la constellation ("" pour l'enlever)
    lune: "The Moon · {pct}% illuminated", // {pct} = pourcentage éclairé
    paysage: "Turn your phone",
  },
};

export type Content = typeof content;
