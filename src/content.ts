// ─────────────────────────────────────────────────────────────
//  TOUT le contenu personnel est ici. Rien d'autre à modifier.
//  Après un changement : `npm run deploy`.
// ─────────────────────────────────────────────────────────────
export const content = {
  prenom: "Prénom", // ← à remplacer

  naissance: {
    date: "2005-11-16",
    heure: "23:00", // si inconnue : laisser "23:00" (ciel de nuit)
    ville: "Toulouse", // ← à remplacer
    lat: 43.6045, // ← coordonnées de la ville
    lon: 1.444,
    fuseau: "Europe/Paris",
  },

  // Un message par étoile du lapin, dans l'ordre où les traits se dessinent
  // (museau, oreilles, dos, queue, pattes). 8 à 12 messages possibles.
  messages: [
    "Message 1 — à remplacer.",
    "Message 2 — à remplacer.",
    "Message 3 — à remplacer.",
    "Message 4 — à remplacer.",
    "Message 5 — à remplacer.",
    "Message 6 — à remplacer.",
    "Message 7 — à remplacer.",
    "Message 8 — à remplacer.",
    "Message 9 — à remplacer.",
    "Message 10 — à remplacer.",
  ],

  // Petit mot quand elle touche la Lune (laisser "" pour désactiver).
  messageLune: "La nuit où tu es née, la Lune était pleine.",

  messageFinal: "Message final — à remplacer.",
  signature: "Signature",

  // Textes d'interface (modifiables aussi).
  ui: {
    commencer: "Toucher pour commencer",
    indice: "Certaines étoiles brillent un peu plus fort que les autres…",
    joyeux: "Joyeux anniversaire",
    revoir: "Revoir le ciel",
    constellation: "le Lapin", // légende sous la constellation ("" pour l'enlever)
    paysage: "Tourne ton téléphone",
  },
};

export type Content = typeof content;
