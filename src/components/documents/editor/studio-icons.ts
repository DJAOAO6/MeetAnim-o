export type StudioIconCategory = "Contact" | "Rendez-vous" | "Animal" | "Consultation" | "Santé" | "Cabinet" | "Documents";

export type StudioIcon = {
  name: string;
  category: StudioIconCategory;
  // Un seul chemin SVG (viewBox 0 0 24 24, fill:none, trait 2), pouvant
  // contenir plusieurs sous-chemins "M...Z" — même convention que Flèche
  // double/Chevron (lines-panel.tsx, étape 20).
  path: string;
};

/**
 * Bibliothèque d'icônes du Studio (étape 23, élargie à l'étape 24) — ~39
 * icônes choisies plutôt que des centaines ("qualité > quantité", déjà
 * appliqué aux formes et aux polices). Tracés repris tels quels de Lucide
 * (lucide.dev, licence ISC, permissive) plutôt que dessinés à la main — le
 * premier jet fait main avait un vrai défaut visuel (petits cercles/ellipses
 * dont le rayon était à peine plus grand que l'épaisseur de trait, les
 * faisant apparaître comme des blobs pleins plutôt que des anneaux fins).
 * Lucide est déjà la source du registre d'icônes de l'app
 * (src/components/ui/icon.tsx, mêmes tracés reconnaissables) — même famille
 * visuelle, mêmes proportions vérifiées par un vrai designer. `<rect>`/
 * `<circle>` convertis en syntaxe de chemin (un seul `<Path>` Konva par
 * icône, voir canvas-stage.tsx), sinon copiés tels quels.
 */
export const STUDIO_ICONS: StudioIcon[] = [
  // --- Contact ---
  {
    name: "Téléphone",
    category: "Contact",
    path: "M13.832 16.568a1 1 0 0 0 1.213-.303l.355-.465A2 2 0 0 1 17 15h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2A18 18 0 0 1 2 4a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v3a2 2 0 0 1-.8 1.6l-.468.351a1 1 0 0 0-.292 1.233 14 14 0 0 0 6.392 6.384",
  },
  {
    name: "Email",
    category: "Contact",
    path: "M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M22 7l-8.991 5.727a2 2 0 0 1-2.009 0L2 7",
  },
  {
    name: "Localisation",
    category: "Contact",
    path: "M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0Z M9 10a3 3 0 1 0 6 0 3 3 0 1 0-6 0",
  },
  // --- Rendez-vous ---
  {
    name: "Calendrier",
    category: "Rendez-vous",
    path: "M8 2v3M16 2v3 M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z M3 9h18",
  },
  {
    name: "Horloge",
    category: "Rendez-vous",
    path: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z M12 6v6l4 2",
  },
  {
    name: "Rappel",
    category: "Rendez-vous",
    path: "M10.268 21a2 2 0 0 0 3.464 0 M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326",
  },
  {
    name: "Répétition",
    category: "Rendez-vous",
    // Le 3e sous-tracé de Lucide commence par un "m" minuscule relatif — dans
    // le SVG d'origine c'était le premier (et seul) point de SON <path>,
    // donc absolu par la règle SVG "le tout premier moveto d'un tracé est
    // toujours absolu, quelle que soit sa casse". En le combinant ici dans
    // UN seul tracé Konva (convention de ce fichier), ce n'est plus le
    // premier point du tracé global : il faut donc le rendre explicitement
    // absolu ("M" majuscule) pour préserver exactement la même position,
    // tout en gardant "l" minuscule pour les deux segments relatifs qui
    // suivaient déjà dans l'original.
    path: "m17 2 4 4-4 4 M3 11v-1a4 4 0 0 1 4-4h14 M7 22l-4-4 4-4 M21 13v1a4 4 0 0 1-4 4H3",
  },
  // --- Animal ---
  {
    name: "Patte",
    category: "Animal",
    path: "M9 4a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M16 8a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M18 16a2 2 0 1 0 4 0 2 2 0 1 0-4 0 M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z",
  },
  {
    name: "Sexe mâle",
    category: "Animal",
    path: "M16 3h5v5 M21 3l-6.75 6.75 M4 14a6 6 0 1 0 12 0 6 6 0 1 0-12 0",
  },
  {
    name: "Sexe femelle",
    category: "Animal",
    path: "M12 15v7 M9 19h6 M6 9a6 6 0 1 0 12 0 6 6 0 1 0-12 0",
  },
  {
    name: "Poids",
    category: "Animal",
    path: "M12 3v18 M19 8l3 8a5 5 0 0 1-6 0zV7 M3 7h1a17 17 0 0 0 8-2 17 17 0 0 0 8 2h1 M5 8l3 8a5 5 0 0 1-6 0zV7 M7 21h10",
  },
  // Espèces (étape 24) — pictogrammes Lucide dédiés par animal, plutôt
  // qu'anatomiques (Patte/Sexe/Poids ci-dessus) — utile pour illustrer
  // directement le type d'animal concerné dans un document.
  {
    name: "Chien",
    category: "Animal",
    path: "M11.25 16.25h1.5L12 17z M16 14v.5 M4.42 11.247A13.152 13.152 0 0 0 4 14.556C4 18.728 7.582 21 12 21s8-2.272 8-6.444a11.702 11.702 0 0 0-.493-3.309 M8 14v.5 M8.5 8.5c-.384 1.05-1.083 2.028-2.344 2.5-1.931.722-3.576-.297-3.656-1-.113-.994 1.177-6.53 4-7 1.923-.321 3.651.845 3.651 2.235A7.497 7.497 0 0 1 14 5.277c0-1.39 1.844-2.598 3.767-2.277 2.823.47 4.113 6.006 4 7-.08.703-1.725 1.722-3.656 1-1.261-.472-1.855-1.45-2.239-2.5",
  },
  {
    name: "Chat",
    category: "Animal",
    path: "M12 5c.67 0 1.35.09 2 .26 1.78-2 5.03-2.84 6.42-2.26 1.4.58-.42 7-.42 7 .57 1.07 1 2.24 1 3.44C21 17.9 16.97 21 12 21s-9-3-9-7.56c0-1.25.5-2.4 1-3.44 0 0-1.89-6.42-.5-7 1.39-.58 4.72.23 6.5 2.23A9.04 9.04 0 0 1 12 5Z M8 14v.5 M16 14v.5 M11.25 16.25h1.5L12 17l-.75-.75Z",
  },
  {
    name: "Lapin",
    category: "Animal",
    path: "M13 16a3 3 0 0 1 2.24 5 M18 12h.01 M18 21h-8a4 4 0 0 1-4-4 7 7 0 0 1 7-7h.2L9.6 6.4a1 1 0 1 1 2.8-2.8L15.8 7h.2c3.3 0 6 2.7 6 6v1a2 2 0 0 1-2 2h-1a3 3 0 0 0-3 3 M20 8.54V4a2 2 0 1 0-4 0v3 M7.612 12.524a3 3 0 1 0-1.6 4.3",
  },
  {
    name: "Oiseau",
    category: "Animal",
    path: "M16 7h.01 M3.4 18H12a8 8 0 0 0 8-8V7a4 4 0 0 0-7.28-2.3L2 20 M20 7l2 .5-2 .5 M10 18v3 M14 17.75V21 M7 18a6 6 0 0 0 3.84-10.61",
  },
  {
    name: "Poisson",
    category: "Animal",
    path: "M6.5 12c.94-3.46 4.94-6 8.5-6 3.56 0 6.06 2.54 7 6-.94 3.47-3.44 6-7 6s-7.56-2.53-8.5-6Z M18 12v.5 M16 17.93a9.77 9.77 0 0 1 0-11.86 M7 10.67C7 8 5.58 5.97 2.73 5.5c-1 1.5-1 5 .23 6.5-1.24 1.5-1.24 5-.23 6.5C5.58 18.03 7 16 7 13.33 M10.46 7.26C10.2 5.88 9.17 4.24 8 3h5.8a2 2 0 0 1 1.98 1.67l.23 1.4 M16.01 17.93l-.23 1.4A2 2 0 0 1 13.8 21H9.5a5.96 5.96 0 0 0 1.49-3.98",
  },
  // --- Consultation ---
  {
    name: "Stéthoscope",
    category: "Consultation",
    path: "M11 2v2M5 2v2 M5 3H4a2 2 0 0 0-2 2v4a6 6 0 0 0 12 0V5a2 2 0 0 0-2-2h-1 M8 15a6 6 0 0 0 12 0v-3 M18 10a2 2 0 1 0 4 0 2 2 0 1 0-4 0",
  },
  {
    name: "Seringue",
    category: "Consultation",
    path: "M18 2l4 4 M17 7l3-3 M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5 M9 11l4 4 M5 19l-3 3 M14 4l6 6",
  },
  {
    name: "Thermomètre",
    category: "Consultation",
    path: "M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z",
  },
  {
    name: "Pilule",
    category: "Consultation",
    path: "M10.5 20.5 20.5 10.5a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z M8.5 8.5l7 7",
  },
  {
    name: "Loupe",
    category: "Consultation",
    path: "M21 21l-4.34-4.34 M3 11a8 8 0 1 0 16 0 8 8 0 1 0-16 0",
  },
  {
    name: "Os",
    category: "Consultation",
    path: "M17 10c.7-.7 1.69 0 2.5 0a2.5 2.5 0 1 0 0-5 .5.5 0 0 1-.5-.5 2.5 2.5 0 1 0-5 0c0 .81.7 1.8 0 2.5l-7 7c-.7.7-1.69 0-2.5 0a2.5 2.5 0 0 0 0 5c.28 0 .5.22.5.5a2.5 2.5 0 1 0 5 0c0-.81-.7-1.8 0-2.5Z",
  },
  {
    name: "Bandage",
    category: "Consultation",
    path: "M10 10.01h.01 M10 14.01h.01 M14 10.01h.01 M14 14.01h.01 M18 6v12 M6 6v12",
  },
  {
    name: "Rapport",
    category: "Consultation",
    path: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M12 11h4 M12 16h4 M8 11h.01 M8 16h.01",
  },
  {
    name: "Analyse",
    category: "Consultation",
    path: "M14 2v6a2 2 0 0 0 .245.96l5.51 10.08A2 2 0 0 1 18 22H6a2 2 0 0 1-1.755-2.96l5.51-10.08A2 2 0 0 0 10 8V2 M6.453 15h11.094 M8.5 2h7",
  },
  // --- Santé ---
  {
    name: "Cœur",
    category: "Santé",
    path: "M2 9.5a5.5 5.5 0 0 1 9.591-3.676.56.56 0 0 0 .818 0A5.49 5.49 0 0 1 22 9.5c0 2.29-1.5 4-3 5.5l-5.492 5.313a2 2 0 0 1-3 .019L5 15c-1.5-1.5-3-3.2-3-5.5",
  },
  {
    name: "Alerte",
    category: "Santé",
    path: "M21.73 18 13.73 4a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3 M12 9v4 M12 17h.01",
  },
  {
    name: "Coche",
    category: "Santé",
    path: "M20 6 9 17l-5-5",
  },
  {
    name: "Interdiction",
    category: "Santé",
    path: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z M4.929 4.929 19.07 19.071",
  },
  {
    name: "Info",
    category: "Santé",
    path: "M2 12a10 10 0 1 0 20 0 10 10 0 1 0-20 0Z M12 16v-4 M12 8h.01",
  },
  // --- Cabinet ---
  {
    name: "Cabinet",
    category: "Cabinet",
    path: "M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8 M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  },
  {
    name: "Signature",
    category: "Cabinet",
    path: "M21 17l-2.156-1.868A.5.5 0 0 0 18 15.5v.5a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1c0-2.545-3.991-3.97-8.5-4a1 1 0 0 0 0 5c4.153 0 4.745-11.295 5.708-13.5a2.5 2.5 0 1 1 3.31 3.284 M3 21h18",
  },
  {
    name: "Dossier",
    category: "Cabinet",
    path: "M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z",
  },
  {
    name: "Facture",
    category: "Cabinet",
    path: "M12 17V7 M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8 M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z",
  },
  {
    name: "Imprimante",
    category: "Cabinet",
    path: "M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2 M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6",
  },
  // --- Documents ---
  {
    name: "Fichier",
    category: "Documents",
    path: "M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z M14 2v5a1 1 0 0 0 1 1h5",
  },
  {
    name: "Pièce jointe",
    category: "Documents",
    path: "m16 6-8.414 8.586a2 2 0 0 0 2.829 2.829l8.414-8.586a4 4 0 1 0-5.657-5.657l-8.379 8.551a6 6 0 1 0 8.485 8.485l8.379-8.551",
  },
  {
    name: "Téléchargement",
    category: "Documents",
    path: "M12 15V3 M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4 M7 10l5 5 5-5",
  },
  {
    name: "Favori",
    category: "Documents",
    path: "M11.525 2.295a.53.53 0 0 1 .95 0l2.31 4.679a2.123 2.123 0 0 0 1.595 1.16l5.166.756a.53.53 0 0 1 .294.904l-3.736 3.638a2.123 2.123 0 0 0-.611 1.878l.882 5.14a.53.53 0 0 1-.771.56l-4.618-2.428a2.122 2.122 0 0 0-1.973 0L6.396 21.01a.53.53 0 0 1-.77-.56l.881-5.139a2.122 2.122 0 0 0-.611-1.879L2.16 9.795a.53.53 0 0 1 .294-.906l5.165-.755a2.122 2.122 0 0 0 1.597-1.16z",
  },
];

export function studioIconByName(name: string): StudioIcon | undefined {
  return STUDIO_ICONS.find((icon) => icon.name === name);
}
