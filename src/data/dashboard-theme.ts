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
};

export const defaultDisplayOptions: DashboardDisplayOptions = {
  compactMenu: false,
  iconsOnly: false,
  density: "normal",
  roundedCards: true,
  smoothAnimations: true,
  fontFamily: "Nunito Sans",
};

export type DashboardThemeSettings = {
  mode: DashboardThemeMode;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  sidebarColor: string;
  actionColor: string;
  displayOptions: DashboardDisplayOptions;
  navigationAssets: Partial<Record<NavigationAssetKey, string>>;
  speciesColors: Partial<Record<AnimalSpecies, string>>;
};

// AUDIT_COMPLET.md P1-4 : #59B9AA (primaryColor/actionColor du thème clair,
// celui effectivement rendu par défaut) échoue au contraste WCAG AA — mesuré
// à 2,35:1 en texte blanc sur fond bouton et ~2,6:1 en texte sur fond clair,
// contre 4,5:1 requis. #2F7A6E (même teinte, déjà présent comme
// secondaryColor du thème clair) atteint ~5,1:1 dans les deux sens.
export const lightThemePreset: DashboardThemeSettings = {
  mode: "light",
  primaryColor: "#2F7A6E",
  secondaryColor: "#2F7A6E",
  accentColor: "#F4B860",
  backgroundColor: "#F6F8F7",
  surfaceColor: "#FFFFFF",
  sidebarColor: "#153F47",
  actionColor: "#2F7A6E",
  displayOptions: defaultDisplayOptions,
  navigationAssets: {},
  speciesColors: {},
};

export const darkThemePreset: DashboardThemeSettings = {
  mode: "dark",
  primaryColor: "#62C6B5",
  secondaryColor: "#8FD6C8",
  accentColor: "#F4B860",
  backgroundColor: "#101D22",
  surfaceColor: "#182B32",
  sidebarColor: "#0B171B",
  // Le bouton principal (texte blanc dessus) a besoin d'un fond assez foncé
  // quel que soit le thème de la page — même correctif que actionColor du
  // thème clair. primaryColor (texte sur fond sombre, direction opposée du
  // contraste) n'a pas été mesuré par l'audit et n'est pas modifié ici.
  actionColor: "#2F7A6E",
  displayOptions: defaultDisplayOptions,
  navigationAssets: {},
  speciesColors: {},
};

export const defaultDashboardTheme = lightThemePreset;

export function presetForMode(mode: DashboardThemeMode): DashboardThemeSettings {
  return mode === "dark" ? darkThemePreset : lightThemePreset;
}
