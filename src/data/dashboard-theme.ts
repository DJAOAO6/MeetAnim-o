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

export const lightThemePreset: DashboardThemeSettings = {
  mode: "light",
  primaryColor: "#59B9AA",
  secondaryColor: "#2F7A6E",
  accentColor: "#F4B860",
  backgroundColor: "#F6F8F7",
  surfaceColor: "#FFFFFF",
  sidebarColor: "#153F47",
  actionColor: "#59B9AA",
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
  actionColor: "#4FAF9F",
  displayOptions: defaultDisplayOptions,
  navigationAssets: {},
  speciesColors: {},
};

export const defaultDashboardTheme = lightThemePreset;

export function presetForMode(mode: DashboardThemeMode): DashboardThemeSettings {
  return mode === "dark" ? darkThemePreset : lightThemePreset;
}
