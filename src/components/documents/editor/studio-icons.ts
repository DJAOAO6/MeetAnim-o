export type StudioIconCategory = "Contact" | "Rendez-vous" | "Animal" | "Consultation" | "Santé" | "Cabinet";

export type StudioIcon = {
  name: string;
  category: StudioIconCategory;
  // Un seul chemin SVG (viewBox 0 0 24 24, fill:none, trait 2), pouvant
  // contenir plusieurs sous-chemins "M...Z" — même convention que Flèche
  // double/Chevron (lines-panel.tsx, étape 20).
  path: string;
};

/**
 * Bibliothèque d'icônes du Studio (étape 23) — ~20 icônes choisies plutôt
 * que des centaines ("qualité > quantité", déjà appliqué aux formes et aux
 * polices). Tracés repris tels quels de Lucide (lucide.dev, licence ISC,
 * permissive) plutôt que dessinés à la main — le premier jet fait main avait
 * un vrai défaut visuel (petits cercles/ellipses dont le rayon était à
 * peine plus grand que l'épaisseur de trait, les faisant apparaître
 * comme des blobs pleins plutôt que des anneaux fins). Lucide est déjà la
 * source du registre d'icônes de l'app (src/components/ui/icon.tsx, mêmes
 * tracés reconnaissables) — même famille visuelle, mêmes proportions
 * vérifiées par un vrai designer. `<rect>`/`<circle>` convertis en syntaxe
 * de chemin (un seul `<Path>` Konva par icône, voir canvas-stage.tsx),
 * sinon copiés tels quels.
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
];

export function studioIconByName(name: string): StudioIcon | undefined {
  return STUDIO_ICONS.find((icon) => icon.name === name);
}
