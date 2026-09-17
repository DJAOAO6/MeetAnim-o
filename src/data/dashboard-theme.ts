import type { AnimalSpecies } from "@/data/species";

export type DashboardThemeMode = "light" | "dark" | "auto";

export type DisplayDensity = "compact" | "normal" | "comfortable";

export type FontChoice = "Nunito Sans" | "Inter" | "DM Sans" | "Manrope";

export const fontChoices: FontChoice[] = ["Nunito Sans", "Inter", "DM Sans", "Manrope"];

export const fontFamilyVars: Record<FontChoice, string> = {
  "Nunito Sans": "var(--font-nunito-sans)",
  Inter: "var(--font-inter)",
  "DM Sans": "var(--font-dm-sans)",
  Manrope: "var(--font-manrope)",
};

export type NavigationAssetKey =
  | "dashboard"
  | "agenda"
  | "clients"
  | "tournees"
  | "map"
  | "reminders"
  | "services"
  | "documents"
  | "stats"
  | "settings"
  | "admin";

export type DashboardDisplayOptions = {
  compactMenu: boolean;
  iconsOnly: boolean;
  density: DisplayDensity;
  roundedCards: boolean;
  smoothAnimations: boolean;
  fontFamily: FontChoice;
  /**
   * Curseur en patte dans l'espace de travail. Éteint par défaut : remplacer
   * le curseur système est un parti pris fort pour un outil utilisé toute la
   * journée, et ce choix appartient au professionnel, pas au produit.
   */
  pawCursor: boolean;
  /** Traces de pattes au sol pendant le déplacement. Indépendante du curseur. */
  pawTrail: boolean;
  /** Couleur des pattes. Vide : elles suivent les couleurs du thème. */
  pawColor: string;
};

export const defaultDisplayOptions: DashboardDisplayOptions = {
  compactMenu: false,
  iconsOnly: false,
  density: "normal",
  roundedCards: true,
  smoothAnimations: true,
  fontFamily: "Nunito Sans",
  pawCursor: false,
  pawTrail: false,
  pawColor: "",
};

/**
 * Palette complète de l'interface (fonds, surfaces, bordures, textes, états) —
 * définie en CSS dans src/app/globals.css ([data-palette]). Les couleurs
 * principale/secondaire/accent restent personnalisables par-dessus.
 */
export type ThemePalette = "1002pattes" | "classic";

export type DashboardThemeSettings = {
  mode: DashboardThemeMode;
  palette: ThemePalette;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  displayOptions: DashboardDisplayOptions;
  navigationAssets: Partial<Record<NavigationAssetKey, string>>;
  speciesColors: Partial<Record<AnimalSpecies, string>>;
};

type PresetColors = Pick<DashboardThemeSettings, "primaryColor" | "secondaryColor" | "accentColor">;

// Couleurs par palette et par mode. Contraste WCAG AA vérifié pour la
// couleur principale en texte blanc sur bouton : #A9531C 5,3:1 (1002 Pattes),
// #2F7A6E ~5,1:1 (Émeraude, AUDIT_COMPLET.md P1-4).
const presetColors: Record<ThemePalette, Record<"light" | "dark", PresetColors>> = {
  "1002pattes": {
    light: { primaryColor: "#A9531C", secondaryColor: "#7A4A2A", accentColor: "#E7A64A" },
    dark: { primaryColor: "#E39A62", secondaryColor: "#D9B08C", accentColor: "#E7A64A" },
  },
  classic: {
    light: { primaryColor: "#2F7A6E", secondaryColor: "#2F7A6E", accentColor: "#F4B860" },
    dark: { primaryColor: "#62C6B5", secondaryColor: "#8FD6C8", accentColor: "#F4B860" },
  },
};

export const defaultPalette: ThemePalette = "1002pattes";

export function presetForMode(mode: DashboardThemeMode, palette: ThemePalette = defaultPalette): DashboardThemeSettings {
  const colors = presetColors[palette][mode === "dark" ? "dark" : "light"];
  return { mode, palette, ...colors, displayOptions: defaultDisplayOptions, navigationAssets: {}, speciesColors: {} };
}

export const lightThemePreset = presetForMode("light");
export const darkThemePreset = presetForMode("dark");
export const defaultDashboardTheme = lightThemePreset;
