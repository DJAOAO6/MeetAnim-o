"use client";

import Image from "next/image";
import { useState, type ChangeEvent } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { SectionTitle } from "@/components/settings/settings-fields";
import type { DashboardThemeSettings, NavigationAssetKey } from "@/data/dashboard-theme";
import { animalSpeciesList, resolveSpeciesColor } from "@/data/species";

const colorFields: Array<{
  key: keyof Pick<DashboardThemeSettings, "primaryColor" | "accentColor" | "backgroundColor" | "surfaceColor" | "sidebarColor" | "actionColor">;
  label: string;
  description: string;
}> = [
  { key: "primaryColor", label: "Éléments principaux", description: "Sélections, repères et accents visuels" },
  { key: "actionColor", label: "Boutons d’action", description: "Enregistrer, ajouter, accepter…" },
  { key: "accentColor", label: "Couleur secondaire", description: "Alertes douces et informations importantes" },
  { key: "backgroundColor", label: "Fond du dashboard", description: "Arrière-plan général de l’espace professionnel" },
  { key: "surfaceColor", label: "Cartes et fenêtres", description: "Cartes, formulaires et panneaux" },
  { key: "sidebarColor", label: "Barre de navigation", description: "Menu latéral et en-tête mobile" },
];

const navigationItems: Array<{ key: NavigationAssetKey; label: string; icon: IconName }> = [
  { key: "dashboard", label: "Tableau de bord", icon: "dashboard" },
  { key: "agenda", label: "Agenda", icon: "agenda" },
  { key: "clients", label: "Clients & animaux", icon: "clients" },
  { key: "tournees", label: "Tournées", icon: "tournees" },
  { key: "map", label: "Carte clients", icon: "map" },
  { key: "reminders", label: "Rappels clients", icon: "bell" },
  { key: "services", label: "Prestations", icon: "services" },
  { key: "stats", label: "Statistiques", icon: "stats" },
  { key: "settings", label: "Paramètres", icon: "settings" },
];

export function DashboardThemeSettings() {
  const { theme, updateTheme, applyPreset, resetTheme, setNavigationAsset, resetNavigationAssets, setSpeciesColor, resetSpeciesColors } = useDashboardTheme();
  const [uploadError, setUploadError] = useState<string | null>(null);

  function handleAsset(key: NavigationAssetKey, event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    if (file.size > 600_000) {
      setUploadError("L’image doit peser moins de 600 Ko pour être conservée dans ce navigateur.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setNavigationAsset(key, reader.result);
        setUploadError(null);
      }
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden p-5 sm:p-6">
        <SectionTitle
          title="Thème de l’interface professionnelle"
          description="Personnalisez le dashboard. Les modifications sont appliquées immédiatement et conservées dans ce navigateur."
          action={<button type="button" onClick={resetTheme} className="rounded-[14px] border border-animeo px-4 py-2.5 text-xs font-extrabold text-animeo transition hover:bg-animeo-soft">Restaurer le thème Animéo</button>}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <ThemePresetButton
            active={theme.mode === "light"}
            label="Thème clair"
            description="Le thème Animéo d’origine"
            colors={["#F7FAF9", "#FFFFFF", "#4FAF9F", "#183B45"]}
            onClick={() => applyPreset("light")}
          />
          <ThemePresetButton
            active={theme.mode === "dark"}
            label="Thème sombre"
            description="Confortable en faible luminosité"
            colors={["#101D22", "#182B32", "#62C6B5", "#0B171B"]}
            onClick={() => applyPreset("dark")}
          />
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {colorFields.map((field) => (
            <ThemeColorControl
              key={field.key}
              label={field.label}
              description={field.description}
              value={theme[field.key]}
              onChange={(value) => updateTheme({ [field.key]: value })}
            />
          ))}
        </div>

        <div className="mt-6 overflow-hidden rounded-[18px] border border-[var(--theme-border)]" style={{ backgroundColor: theme.backgroundColor }}>
          <div className="grid min-h-44 grid-cols-[86px_1fr]">
            <div className="p-3" style={{ backgroundColor: theme.sidebarColor }}>
              <div className="mb-5 h-3 w-12 rounded-full bg-white/85" />
              {[0, 1, 2, 3].map((item) => <div key={item} className="mb-2 h-6 rounded-lg" style={{ backgroundColor: item === 0 ? theme.primaryColor : "rgba(255,255,255,0.1)" }} />)}
            </div>
            <div className="p-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div className="h-3 w-28 rounded-full" style={{ backgroundColor: theme.mode === "dark" ? "#F7FBFA" : "#183B45" }} />
                  <div className="mt-2 h-2 w-40 rounded-full opacity-35" style={{ backgroundColor: theme.mode === "dark" ? "#F7FBFA" : "#183B45" }} />
                </div>
                <div className="h-8 w-24 rounded-[10px]" style={{ backgroundColor: theme.actionColor }} />
              </div>
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((item) => <div key={item} className="h-20 rounded-xl border border-black/5 p-2" style={{ backgroundColor: theme.surfaceColor }}><div className="h-7 w-7 rounded-lg" style={{ backgroundColor: item === 1 ? theme.accentColor : theme.primaryColor, opacity: 0.75 }} /></div>)}
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Icônes et images du menu"
          description="Remplacez une icône par votre propre pictogramme ou une petite image PNG, JPG ou WebP. Le format carré est recommandé."
          action={<button type="button" onClick={resetNavigationAssets} className="rounded-[14px] border border-animeo px-4 py-2.5 text-xs font-extrabold text-animeo transition hover:bg-animeo-soft">Réinitialiser les icônes</button>}
        />

        {uploadError ? <p role="alert" className="mb-4 rounded-[14px] bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{uploadError}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {navigationItems.map((item) => {
            const asset = theme.navigationAssets[item.key];
            return (
              <div key={item.key} className="flex items-center gap-3 rounded-[16px] border border-[var(--theme-border)] bg-animeo-bg p-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[12px] bg-animeo-soft text-animeo-dark">
                  {asset ? <Image src={asset} alt="" width={44} height={44} unoptimized className="h-full w-full object-cover" /> : <Icon name={item.icon} className="h-5 w-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold text-animeo-dark">{item.label}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <label className="cursor-pointer text-xs font-extrabold text-animeo hover:underline">
                      {asset ? "Remplacer" : "Importer"}
                      <input type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => handleAsset(item.key, event)} className="sr-only" />
                    </label>
                    {asset ? <button type="button" onClick={() => setNavigationAsset(item.key, null)} className="text-xs font-bold text-animeo-muted hover:text-animeo-error">Retirer</button> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-5 sm:p-6">
        <SectionTitle
          title="Couleurs des animaux"
          description="Un code couleur par espèce pour repérer vos clients en un coup d’œil sur la carte."
          action={<button type="button" onClick={resetSpeciesColors} className="rounded-[14px] border border-animeo px-4 py-2.5 text-xs font-extrabold text-animeo transition hover:bg-animeo-soft">Réinitialiser les couleurs</button>}
        />

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {animalSpeciesList.map((species) => (
            <ThemeColorControl
              key={species}
              label={species}
              description={`Marqueurs "${species}" sur la carte`}
              value={resolveSpeciesColor(theme.speciesColors, species)}
              onChange={(value) => setSpeciesColor(species, value)}
            />
          ))}
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3 rounded-[16px] border border-[var(--theme-border)] bg-animeo-bg p-4">
          {animalSpeciesList.map((species) => (
            <span key={species} className="flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
              <span className="h-3 w-3 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, species) }} />
              {species}
              {theme.speciesColors[species] === undefined ? null : <span className="font-mono text-[10px] font-bold text-animeo-muted">{theme.speciesColors[species]?.toUpperCase()}</span>}
            </span>
          ))}
        </div>
      </Card>
    </div>
  );
}

function ThemePresetButton({ active, label, description, colors, onClick }: { active: boolean; label: string; description: string; colors: string[]; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={`flex items-center gap-4 rounded-[16px] border p-4 text-left transition ${active ? "theme-selected-option shadow-sm" : "border-[var(--theme-border)] bg-animeo-bg hover:border-animeo"}`}>
      <span className="grid h-12 w-12 shrink-0 grid-cols-2 overflow-hidden rounded-[12px] border border-black/5">
        {colors.map((color) => <span key={color} style={{ backgroundColor: color }} />)}
      </span>
      <span>
        <span className="block font-extrabold text-animeo-dark">{label}</span>
        <span className="mt-0.5 block text-xs text-animeo-muted">{description}</span>
      </span>
    </button>
  );
}

function ThemeColorControl({ label, description, value, onChange }: { label: string; description: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex items-center gap-3 rounded-[16px] border border-[var(--theme-border)] bg-animeo-bg p-3.5">
      <input type="color" value={value} onChange={(event) => onChange(event.target.value.toUpperCase())} className="h-11 w-11 shrink-0 cursor-pointer rounded-[12px] border-0 bg-transparent p-0" />
      <span className="min-w-0">
        <span className="block text-sm font-extrabold text-animeo-dark">{label}</span>
        <span className="block truncate text-xs text-animeo-muted">{description}</span>
        <span className="mt-1 block font-mono text-[11px] font-bold text-animeo">{value.toUpperCase()}</span>
      </span>
    </label>
  );
}
