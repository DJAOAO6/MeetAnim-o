export type StudioFontCategory = "Sans Serif" | "Serif" | "Condensée";

export type StudioFont = {
  name: string;
  cssVar: string;
  category: StudioFontCategory;
};

/**
 * Bibliothèque de polices du Studio (étape 17) — 20 polices choisies plutôt
 * que 30-50 (principe explicite "qualité > quantité", voir le plan), toutes
 * chargées via next/font/google dans src/app/layout.tsx. `cssVar` doit
 * correspondre exactement à la variable déclarée là-bas.
 */
export const STUDIO_FONTS: StudioFont[] = [
  { name: "Nunito Sans", cssVar: "var(--font-nunito-sans)", category: "Sans Serif" },
  { name: "Inter", cssVar: "var(--font-inter)", category: "Sans Serif" },
  { name: "DM Sans", cssVar: "var(--font-dm-sans)", category: "Sans Serif" },
  { name: "Manrope", cssVar: "var(--font-manrope)", category: "Sans Serif" },
  { name: "Poppins", cssVar: "var(--font-poppins)", category: "Sans Serif" },
  { name: "Montserrat", cssVar: "var(--font-montserrat)", category: "Sans Serif" },
  { name: "Roboto", cssVar: "var(--font-roboto)", category: "Sans Serif" },
  { name: "Open Sans", cssVar: "var(--font-open-sans)", category: "Sans Serif" },
  { name: "Lato", cssVar: "var(--font-lato)", category: "Sans Serif" },
  { name: "Work Sans", cssVar: "var(--font-work-sans)", category: "Sans Serif" },
  { name: "Source Sans 3", cssVar: "var(--font-source-sans-3)", category: "Sans Serif" },
  { name: "Merriweather", cssVar: "var(--font-merriweather)", category: "Serif" },
  { name: "Playfair Display", cssVar: "var(--font-playfair-display)", category: "Serif" },
  { name: "Libre Baskerville", cssVar: "var(--font-libre-baskerville)", category: "Serif" },
  { name: "Cormorant Garamond", cssVar: "var(--font-cormorant-garamond)", category: "Serif" },
  { name: "Lora", cssVar: "var(--font-lora)", category: "Serif" },
  { name: "PT Serif", cssVar: "var(--font-pt-serif)", category: "Serif" },
  { name: "Oswald", cssVar: "var(--font-oswald)", category: "Condensée" },
  { name: "Roboto Condensed", cssVar: "var(--font-roboto-condensed)", category: "Condensée" },
  { name: "Bebas Neue", cssVar: "var(--font-bebas-neue)", category: "Condensée" },
];

export function studioFontByName(name: string): StudioFont | undefined {
  return STUDIO_FONTS.find((font) => font.name === name);
}

export function studioFontByCssVar(cssVar: string): StudioFont | undefined {
  return STUDIO_FONTS.find((font) => font.cssVar === cssVar);
}
