"use client";

import { createContext, useContext, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  defaultDashboardTheme,
  presetForMode,
  type DashboardThemeMode,
  type DashboardThemeSettings,
  type NavigationAssetKey,
} from "@/data/dashboard-theme";
import type { AnimalSpecies } from "@/data/species";

const storageKey = "animeo-dashboard-theme-v1";

type DashboardThemeContextValue = {
  theme: DashboardThemeSettings;
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

  const value = useMemo<DashboardThemeContextValue>(() => ({
    theme,
    updateTheme: (patch) => {
      setTheme((current) => {
        const next = normalizeTheme({ ...current, ...patch });
        persistTheme(next);
        return next;
      });
    },
    applyPreset: (mode) => {
      setTheme((current) => {
        const next = { ...presetForMode(mode), navigationAssets: current.navigationAssets, speciesColors: current.speciesColors };
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
  }), [theme]);

  const dark = theme.mode === "dark";
  const style = {
    "--theme-primary": theme.primaryColor,
    "--theme-accent": theme.accentColor,
    "--theme-background": theme.backgroundColor,
    "--theme-surface": theme.surfaceColor,
    "--theme-sidebar": theme.sidebarColor,
    "--theme-action": theme.actionColor,
    "--theme-text": dark ? "#E8F0EF" : "#1F2933",
    "--theme-heading": dark ? "#F7FBFA" : "#183B45",
    "--theme-muted": dark ? "#A8B8BD" : "#6B7780",
    "--theme-soft": "color-mix(in srgb, var(--theme-primary) 13%, var(--theme-surface))",
    "--theme-border": "color-mix(in srgb, var(--theme-heading) 13%, var(--theme-surface))",
  } as CSSProperties;

  return (
    <DashboardThemeContext.Provider value={value}>
      <div className="dashboard-theme-surface min-h-screen" data-dashboard-theme data-theme={theme.mode} style={style}>
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
