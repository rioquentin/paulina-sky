# Le ciel de ta naissance

Une page à ouvrir sur iPhone : le vrai ciel de la nuit et du lieu de naissance, dix étoiles à toucher, un lapin qui se dessine.

## Modifier le contenu

Tout est dans [`src/content.ts`](src/content.ts) : prénom, date, heure, ville et coordonnées, les messages (8 à 12), le mot de la Lune, le message final, la signature.

Le ciel, la position de la Lune et le choix des étoiles du lapin sont recalculés à partir de ce fichier. Après un changement de date, d'heure ou de ville, ouvrir `?debug` pour vérifier la forme du lapin.

## Commandes

| Commande | Rôle |
|---|---|
| `npm run dev` | Serveur local. Avec l'adresse « Network » affichée, on ouvre le site sur l'iPhone (même Wi-Fi). |
| `npm run build` | Construit `dist/`. |
| `npm run deploy` | Build puis mise en ligne sur Vercel (production). |
| `npm run stars` | Régénère `public/stars.json` depuis le catalogue HYG (téléchargé dans `data-cache/`, non commité). |
| `npm run check` | Vérification TypeScript. |

Image d'aperçu et icônes : avec `npm run dev` lancé, ouvrir `/og.html`. La page redessine `public/og.jpg`, `apple-touch-icon.png` et `icon-64.png` avec le ciel de `content.ts`.

## Paramètres d'URL

- `?debug` : fps, bouton « Tout débloquer », noms des étoiles brillantes. `?debug=lapin` entoure et numérote en plus les étoiles du lapin (à ne pas montrer avant la surprise).
- `?q=high` : désactive l'allègement automatique (bloom coupé, puis résolution réduite, si les fps chutent).

## Mise en ligne (Vercel)

1. `npx vercel login`
2. `npx vercel link` en choisissant un nom de projet non devinable : c'est lui qui donne l'adresse `nom.vercel.app`.
3. `npm run deploy`

L'adresse absolue de l'image d'aperçu est injectée au build à partir de l'URL de production fournie par Vercel (ou de la variable `SITE_URL`).

## Comment c'est fait

- `src/astro.ts` : heure locale → UTC, temps sidéral (astronomy-engine), passage en azimut/hauteur, Lune.
- `src/sky.ts` : rendu Three.js. Projection stéréographique dans le shader, étoiles (`THREE.Points`), fond avec Voie lactée et halo lunaire, Lune, bloom.
- `src/figure.ts` : le dessin du lapin. C'est l'icône « rabbit » de [Hugeicons](https://hugeicons.com) (jeu gratuit, licence MIT), posée sur les étoiles par rotation et échelle uniforme, sans déformation. Les autres dessins comparés sont dans `refs/cand/` (planche : `/refs/sheet2.html` en dev).
- `src/rabbit.ts` : gabarit du lapin et recherche des vraies étoiles qui le dessinent le mieux ; repli sur des points inventés si l'écart dépasse 12,5 %.
- `src/fx.ts` : calque 2D (anneaux, étoiles filantes, traits, cœurs).
- `src/finale.ts` : timeline GSAP du final.
- `src/audio.ts` : nappe et carillons synthétisés en Web Audio, sans fichier.
- `src/app.ts` : boucle, toucher, gyroscope, pause en arrière-plan, perte de contexte WebGL.
