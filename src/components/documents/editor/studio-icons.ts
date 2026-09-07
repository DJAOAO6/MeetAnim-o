export type StudioIconCategory = "Contact" | "Rendez-vous" | "Animal" | "Consultation" | "Santé" | "Cabinet";

export type StudioIcon = {
  name: string;
  category: StudioIconCategory;
  // Un seul chemin SVG (viewBox 0 0 24 24, style icon.tsx : traits ronds,
  // fill:none), pouvant contenir plusieurs sous-chemins "M...Z" — même
  // convention que Flèche double/Chevron (lines-panel.tsx, étape 20).
  path: string;
};

/**
 * Bibliothèque d'icônes du Studio (étape 23) — ~20 icônes choisies plutôt
 * que des centaines ("qualité > quantité", déjà appliqué aux formes et aux
 * polices), dessinées à la main dans le même style que le registre d'icônes
 * de l'app (src/components/ui/icon.tsx : viewBox 24x24, traits ronds) —
 * jamais stockées dans les éléments eux-mêmes, voir DocumentIconElement
 * dans content.ts.
 */
export const STUDIO_ICONS: StudioIcon[] = [
  // --- Contact ---
  {
    name: "Téléphone",
    category: "Contact",
    path: "M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.362 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.338 1.85.573 2.81.7A2 2 0 0 1 22 16.92Z",
  },
  {
    name: "Email",
    category: "Contact",
    path: "M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z M3.5 6.5l8.5 6 8.5-6",
  },
  {
    name: "Localisation",
    category: "Contact",
    path: "M12 21s-7-6.5-7-11.5A7 7 0 0 1 12 2.5a7 7 0 0 1 7 7C19 14.5 12 21 12 21Z M12 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z",
  },
  // --- Rendez-vous ---
  {
    name: "Calendrier",
    category: "Rendez-vous",
    path: "M5 4h14a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z M8 2.5v3M16 2.5v3M4 9.5h16",
  },
  {
    name: "Horloge",
    category: "Rendez-vous",
    path: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z M12 7v5l3.5 2",
  },
  // --- Animal ---
  {
    name: "Patte",
    category: "Animal",
    path: "M12 21a4 3.2 0 1 0 0-6.4 4 3.2 0 0 0 0 6.4Z M6.5 13a1.8 2.4 0 1 0 0-4.8 1.8 2.4 0 0 0 0 4.8Z M17.5 13a1.8 2.4 0 1 0 0-4.8 1.8 2.4 0 0 0 0 4.8Z M9.5 9a1.6 2.2 0 1 0 0-4.4 1.6 2.2 0 0 0 0 4.4Z M14.5 9a1.6 2.2 0 1 0 0-4.4 1.6 2.2 0 0 0 0 4.4Z",
  },
  {
    name: "Sexe mâle",
    category: "Animal",
    path: "M10 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z M14 4h5v5M19 4l-6.5 6.5",
  },
  {
    name: "Sexe femelle",
    category: "Animal",
    path: "M12 4a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z M12 14v7M9 18h6",
  },
  {
    name: "Poids",
    category: "Animal",
    path: "M12 3v14M7 6h10M7 6l-2.5 6a2.5 2.5 0 0 0 5 0L7 6Z M17 6l-2.5 6a2.5 2.5 0 0 0 5 0L17 6Z M8 21h8",
  },
  // --- Consultation ---
  {
    name: "Stéthoscope",
    category: "Consultation",
    path: "M6 3v5a2 2 0 0 0 4 0V3 M8 10v3a5 5 0 0 0 10 0v-2 M18 16.5a2.5 2.5 0 1 0 0 5 2.5 2.5 0 0 0 0-5Z",
  },
  {
    name: "Seringue",
    category: "Consultation",
    path: "M6 9h12v6H6Z M2 12h4 M2 9v6 M18 12h4 M9 9v6 M13 9v6",
  },
  {
    name: "Thermomètre",
    category: "Consultation",
    path: "M10 13.5V5a2 2 0 0 1 4 0v8.5a4 4 0 1 1-4 0Z M12 8v6",
  },
  {
    name: "Pilule",
    category: "Consultation",
    path: "M4.5 14.5 14.5 4.5a5 5 0 1 1 7 7L11.5 21.5a5 5 0 1 1-7-7Z M9 10l5 5",
  },
  {
    name: "Loupe",
    category: "Consultation",
    path: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3",
  },
  // --- Santé ---
  {
    name: "Cœur",
    category: "Santé",
    path: "M12 20.5s-7.5-4.6-9.8-9.6C.6 7.1 2.4 3.5 6 3c2.4-.3 4.6 1 6 3.2C13.4 4 15.6 2.7 18 3c3.6.5 5.4 4.1 3.8 7.9-2.3 5-9.8 9.6-9.8 9.6Z",
  },
  {
    name: "Alerte",
    category: "Santé",
    path: "M12 3.5 22 20.5H2Z M12 10v4M12 17h.01",
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
    path: "M4 11.5 12 4l8 7.5 M6 10v9a1 1 0 0 0 1 1h3v-6h4v6h3a1 1 0 0 0 1-1v-9",
  },
  {
    name: "Signature",
    category: "Cabinet",
    path: "M3 17c2-4 3.5-8 5-8s1 5 3 5 3-9 5-4 2 4 3 4 1-1 2-2 M3 21h18",
  },
  {
    name: "Dossier",
    category: "Cabinet",
    path: "M3 7a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z",
  },
];

export function studioIconByName(name: string): StudioIcon | undefined {
  return STUDIO_ICONS.find((icon) => icon.name === name);
}
