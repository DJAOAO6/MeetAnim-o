import type { AnimalSpecies } from "@/data/species";

export type DashboardThemeMode = "light" | "dark";

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

export type DashboardThemeSettings = {
  mode: DashboardThemeMode;
  primaryColor: string;
  accentColor: string;
  backgroundColor: string;
  surfaceColor: string;
  sidebarColor: string;
  actionColor: string;
  navigationAssets: Partial<Record<NavigationAssetKey, string>>;
  speciesColors: Partial<Record<AnimalSpecies, string>>;
};

export const lightThemePreset: DashboardThemeSettings = {
  mode: "light",
  primaryColor: "#4FAF9F",
  accentColor: "#F4B860",
  backgroundColor: "#F7FAF9",
  surfaceColor: "#FFFFFF",
  sidebarColor: "#183B45",
  actionColor: "#4FAF9F",
  navigationAssets: {},
  speciesColors: {},
};

export const darkThemePreset: DashboardThemeSettings = {
  mode: "dark",
  primaryColor: "#62C6B5",
  accentColor: "#F4B860",
  backgroundColor: "#101D22",
  surfaceColor: "#182B32",
  sidebarColor: "#0B171B",
  actionColor: "#4FAF9F",
  navigationAssets: {},
  speciesColors: {},
};

export const defaultDashboardTheme = lightThemePreset;

export function presetForMode(mode: DashboardThemeMode): DashboardThemeSettings {
  return mode === "dark" ? darkThemePreset : lightThemePreset;
}
