"use client";

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  defaultDashboardTheme,
  defaultDisplayOptions,
  defaultPalette,
  fontFamilyVars,
  presetForMode,
  type DashboardDisplayOptions,
  type DashboardThemeMode,
  type DashboardThemeSettings,
  type NavigationAssetKey,
  type ThemePalette,
} from "@/data/dashboard-theme";
import type { AnimalSpecies } from "@/data/species";

// v2 : arrivée des palettes complètes (1002 Pattes par défaut). Les réglages
// v1 ne sont repris que pour ce qui ne dépend pas des couleurs (options
// d'affichage, icônes de navigation, couleurs d'espèces) : leurs couleurs
// principales datent de l'ancien thème Émeraude et donneraient un rendu
// incohérent mélangé à la nouvelle palette.
const storageKey = "1002pattes-dashboard-theme-v2";
const legacyStorageKey = "animeo-dashboard-theme-v1";

type DashboardThemeContextValue = {
  theme: DashboardThemeSettings;
  effectiveMode: "light" | "dark";
  updateTheme: (patch: Partial<Omit<DashboardThemeSettings, "navigationAssets" | "speciesColors">>) => void;
  applyPreset: (mode: DashboardThemeMode, palette?: ThemePalette) => void;
  resetTheme: () => void;
  setNavigationAsset: (key: NavigationAssetKey, value: string | null) => void;
  resetNavigationAssets: () => void;
  setSpeciesColor: (species: AnimalSpecies, value: string | null) => void;
  resetSpeciesColors: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

function normalizeTheme(value: Partial<DashboardThemeSettings>): DashboardThemeSettings {
  const palette: ThemePalette = value.palette === "classic" ? "classic" : defaultPalette;
  const preset = presetForMode(value.mode === "dark" ? "dark" : "light", palette);

  return {
    ...preset,
    ...value,
    palette,
    displayOptions: { ...defaultDisplayOptions, ...(value.displayOptions ?? {}) },
    navigationAssets: value.navigationAssets ?? {},
    speciesColors: value.speciesColors ?? {},
  };
}

function persistTheme(theme: DashboardThemeSettings) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(theme));
  } catch {
    // Le thème reste utilisable pour la session si le stockage local est indisponible.
  }
}

export function DashboardThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<DashboardThemeSettings>(defaultDashboardTheme);
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches,
  );

  useEffect(() => {
    let cancelled = false;
    try {
      const savedTheme = window.localStorage.getItem(storageKey);
      const legacyTheme = savedTheme ? null : window.localStorage.getItem(legacyStorageKey);
      const source = savedTheme
        ? (JSON.parse(savedTheme) as Partial<DashboardThemeSettings>)
        : legacyTheme
          ? (({ mode, displayOptions, navigationAssets, speciesColors }: Partial<DashboardThemeSettings>) => ({ mode, displayOptions, navigationAssets, speciesColors }))(JSON.parse(legacyTheme) as Partial<DashboardThemeSettings>)
          : null;
      if (source) {
        const normalizedTheme = normalizeTheme(source);
        queueMicrotask(() => {
          if (!cancelled) setTheme(normalizedTheme);
        });
      }
    } catch {
      // Une valeur invalide restaure simplement le thème 1002 Pattes par défaut.
    }

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    function handleChange(event: MediaQueryListEvent) {
      setSystemPrefersDark(event.matches);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const value = useMemo<DashboardThemeContextValue>(() => {
    const effectiveMode: "light" | "dark" = theme.mode === "auto" ? (systemPrefersDark ? "dark" : "light") : theme.mode;

    return {
      theme,
      effectiveMode,
      updateTheme: (patch) => {
        setTheme((current) => {
          const next = normalizeTheme({ ...current, ...patch, displayOptions: { ...current.displayOptions, ...patch.displayOptions } });
          persistTheme(next);
          return next;
        });
      },
      applyPreset: (mode, palette) => {
        setTheme((current) => {
          const next = { ...presetForMode(mode, palette ?? current.palette), mode, displayOptions: current.displayOptions, navigationAssets: current.navigationAssets, speciesColors: current.speciesColors };
          persistTheme(next);
          return next;
        });
      },
      resetTheme: () => {
        setTheme((current) => {
          const next = { ...defaultDashboardTheme, navigationAssets: current.navigationAssets, speciesColors: current.speciesColors };
          persistTheme(next);
          return next;
        });
      },
      setNavigationAsset: (key, asset) => {
        setTheme((current) => {
          const navigationAssets = { ...current.navigationAssets };
          if (asset) navigationAssets[key] = asset;
          else delete navigationAssets[key];
          const next = { ...current, navigationAssets };
          persistTheme(next);
          return next;
        });
      },
      resetNavigationAssets: () => {
        setTheme((current) => {
          const next = { ...current, navigationAssets: {} };
          persistTheme(next);
          return next;
        });
      },
      setSpeciesColor: (species, color) => {
        setTheme((current) => {
          const speciesColors = { ...current.speciesColors };
          if (color) speciesColors[species] = color;
          else delete speciesColors[species];
          const next = { ...current, speciesColors };
          persistTheme(next);
          return next;
        });
      },
      resetSpeciesColors: () => {
        setTheme((current) => {
          const next = { ...current, speciesColors: {} };
          persistTheme(next);
          return next;
        });
      },
    };
  }, [theme, systemPrefersDark]);

  const { effectiveMode } = value;
  const dark = effectiveMode === "dark";
  const palettePreset = presetForMode(effectiveMode, theme.palette);
  const displayOptions: DashboardDisplayOptions = theme.displayOptions;
  // Les tons dérivés (fond pastel, bordure accentuée, survol) sont fixés par
  // la palette CSS pour sa couleur principale d'origine ; ils ne sont
  // recalculés que si la couleur principale a été personnalisée, pour rester
  // accordés à cette nouvelle couleur.
  const customPrimary = theme.primaryColor.toUpperCase() !== palettePreset.primaryColor.toUpperCase();
  const style = {
    "--theme-primary": theme.primaryColor,
    "--theme-secondary": theme.secondaryColor,
    "--theme-accent": theme.accentColor,
    ...(dark ? {} : { "--theme-action": theme.primaryColor }),
    ...(customPrimary
      ? {
          "--theme-primary-hover": "color-mix(in srgb, var(--theme-primary) 84%, black)",
          "--theme-brand": theme.primaryColor,
          "--theme-soft": "color-mix(in srgb, var(--theme-primary) 13%, var(--theme-surface))",
          "--theme-soft-strong": "color-mix(in srgb, var(--theme-primary) 22%, var(--theme-surface))",
          "--theme-border-strong": "color-mix(in srgb, var(--theme-primary) 40%, var(--theme-surface))",
          // Émeraude : item actif plein (texte blanc) — suit déjà
          // --theme-primary. 1002 Pattes : item actif pastel, à réaccorder.
          ...(theme.palette === "classic"
            ? { "--theme-sidebar-active-bg": theme.primaryColor }
            : { "--theme-sidebar-active-bg": "var(--theme-soft)", "--theme-sidebar-active-text": theme.primaryColor }),
        }
      : {}),
    "--theme-card-radius": displayOptions.roundedCards ? (theme.palette === "classic" ? "18px" : "20px") : "8px",
    "--theme-font-family": fontFamilyVars[displayOptions.fontFamily],
  } as unknown as CSSProperties;

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        className="dashboard-theme-surface min-h-screen"
        data-dashboard-theme
        data-theme={effectiveMode}
        data-palette={theme.palette}
        data-animations={displayOptions.smoothAnimations ? "on" : "off"}
        style={style}
      >
        {children}
      </div>
    </DashboardThemeContext.Provider>
  );
}

export function useDashboardTheme() {
  const context = useContext(DashboardThemeContext);
  if (!context) throw new Error("useDashboardTheme doit être utilisé dans DashboardThemeProvider");
  return context;
}
