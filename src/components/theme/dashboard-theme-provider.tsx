"use client";

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  defaultDashboardTheme,
  defaultDisplayOptions,
  fontFamilyVars,
  presetForMode,
  type DashboardDisplayOptions,
  type DashboardThemeMode,
  type DashboardThemeSettings,
  type NavigationAssetKey,
} from "@/data/dashboard-theme";
import type { AnimalSpecies } from "@/data/species";

const storageKey = "animeo-dashboard-theme-v1";

type DashboardThemeContextValue = {
  theme: DashboardThemeSettings;
  effectiveMode: "light" | "dark";
  updateTheme: (patch: Partial<Omit<DashboardThemeSettings, "navigationAssets" | "speciesColors">>) => void;
  applyPreset: (mode: DashboardThemeMode) => void;
  resetTheme: () => void;
  setNavigationAsset: (key: NavigationAssetKey, value: string | null) => void;
  resetNavigationAssets: () => void;
  setSpeciesColor: (species: AnimalSpecies, value: string | null) => void;
  resetSpeciesColors: () => void;
};

const DashboardThemeContext = createContext<DashboardThemeContextValue | null>(null);

function normalizeTheme(value: Partial<DashboardThemeSettings>): DashboardThemeSettings {
  const preset = presetForMode(value.mode === "dark" ? "dark" : "light");

  return {
    ...preset,
    ...value,
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
      if (savedTheme) {
        const normalizedTheme = normalizeTheme(JSON.parse(savedTheme) as Partial<DashboardThemeSettings>);
        queueMicrotask(() => {
          if (!cancelled) setTheme(normalizedTheme);
        });
      }
    } catch {
      // Une valeur invalide restaure simplement le thème Animéo par défaut.
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
      applyPreset: (mode) => {
        setTheme((current) => {
          const next = { ...presetForMode(mode), mode, displayOptions: current.displayOptions, navigationAssets: current.navigationAssets, speciesColors: current.speciesColors };
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
  const surfacePreset = presetForMode(effectiveMode);
  const displayOptions: DashboardDisplayOptions = theme.displayOptions;
  const style = {
    "--theme-primary": theme.primaryColor,
    "--theme-secondary": theme.secondaryColor,
    "--theme-accent": theme.accentColor,
    "--theme-background": surfacePreset.backgroundColor,
    "--theme-surface": surfacePreset.surfaceColor,
    "--theme-sidebar": surfacePreset.sidebarColor,
    "--theme-action": theme.primaryColor,
    "--theme-text": dark ? "#E8F0EF" : "#1F2933",
    "--theme-heading": dark ? "#F7FBFA" : "#183B45",
    "--theme-muted": dark ? "#A8B8BD" : "#6B7780",
    "--theme-soft": "color-mix(in srgb, var(--theme-primary) 13%, var(--theme-surface))",
    "--theme-border": "color-mix(in srgb, var(--theme-heading) 13%, var(--theme-surface))",
    "--theme-card-radius": displayOptions.roundedCards ? "18px" : "8px",
    "--theme-font-family": fontFamilyVars[displayOptions.fontFamily],
  } as CSSProperties;

  return (
    <DashboardThemeContext.Provider value={value}>
      <div
        className="dashboard-theme-surface min-h-screen"
        data-dashboard-theme
        data-theme={effectiveMode}
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
