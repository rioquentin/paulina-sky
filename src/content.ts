// ─────────────────────────────────────────────────────────────
//  TOUT le contenu personnel est ici. Rien d'autre à modifier.
//  Le site est en anglais : tous les textes ci-dessous aussi.
//  Après un changement : `npm run deploy`.
// ─────────────────────────────────────────────────────────────
export const content = {
  prenom: "Paulina",

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
    // 1 · l'arrivée
    "You found me.\nThis is the exact sky that was above Solingen the night you were born. It waited twenty-one years for you to look up.",
    // 2 · la fleur au milieu des flammes
    "We met in a place that wasn’t made for meeting anyone. Fire everywhere.\nAnd somewhere in it, a flower. I didn’t even know it was one yet.\nNow I do. You’re beautiful, and your soul is even more beautiful.",
    // 3 · quelqu'un de distant
    "I’m someone who keeps the world at a distance. I always have been.\nThen you showed up, and I forgot to.",
    // 4 · rien n'était gravé dans le marbre
    "I always thought some things about me would never change.\nThen I met you. Turns out I was wrong, and I’ve never been this happy to be wrong.",
    // 5 · son rire
    "If I could keep only one sound in the whole world, it would be your laugh. Those little giggles, and everything that comes after.",
    // 6 · la blague (on respire)
    "I wanted to write something deep and poetic here.\nBut… big but, your butt.\nOkay. We can continue now. Hahaha.",
    // 7 · des souvenirs flous
    "I don’t even know how long it’s been. It feels like forever, and like something I can’t put into words.\nToo many memories and not nearly enough, all a little blurry. Good, it means I was busy being there.",
    // 8 · elle aide tout le monde, et je suis là pour elle
    "You work so hard to help the people around you. You give so much of yourself.\nJust know you never have to carry it all alone. I’m here to help you too.",
    // 9 · ce que je lui souhaite
    "This year, I wish you comfort. A place that feels like yours. People who feel like home.\nDu gehörst hierher. You belong here.",
    // 10 · vers le lapin
    "One of the first names I ever gave you was a silly little one.\nNow look up, Häschen. Let’s see what all these stars were drawing.",
  ],

  // Petit mot quand elle touche la Lune (laisser "" pour désactiver).
  messageLune: "The night you were born, the Moon was full.\nAs if it didn’t want to miss you.",

  messageFinal: "Life will have its storms, and its fires.\nBut tonight the sky drew you a little rabbit, just to tell you this: you have a place here, and people who will keep looking up for you.\nAlles Gute zum Geburtstag.",
  signature: "Quentin",

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
