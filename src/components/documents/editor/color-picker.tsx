"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { ColorWheel } from "@/components/documents/editor/color-wheel";

const RECENT_COLORS_KEY = "animeo-studio-recent-colors-v1";
const FAVORITE_COLORS_KEY = "animeo-studio-favorite-colors-v1";
const MAX_RECENT_COLORS = 8;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function readStringList(key: string): string[] {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function writeStringList(key: string, list: string[]) {
  try {
    window.localStorage.setItem(key, JSON.stringify(list));
  } catch {
    // Stockage indisponible (navigation privée, quota...) — dégrade
    // silencieusement, choisir une couleur reste fonctionnel sans historique.
  }
}

function pushRecentColor(color: string) {
  const next = [color, ...readStringList(RECENT_COLORS_KEY).filter((existing) => existing !== color)].slice(0, MAX_RECENT_COLORS);
  writeStringList(RECENT_COLORS_KEY, next);
}

/**
 * Sélecteur de couleur réutilisable (étape 16) — remplace les
 * `<input type="color">` bruts (fond de forme/contour dans properties-panel.tsx,
 * couleur de texte dans text-format-toolbar.tsx, fond de page). Une seule
 * implémentation partagée : "Couleurs du document" (dérivées du contenu réel,
 * voir collectDocumentColors), "Couleurs 1002 Pattes" (thème du compte,
 * useDashboardTheme — lecture seule, aucun nouveau stockage serveur),
 * "Couleurs récentes" (localStorage, même convention que le thème dashboard),
 * champ HEX libre.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  documentColors = [],
  disabled,
  size = "md",
}: {
  label: string;
  value: string;
  onChange: (color: string) => void;
  documentColors?: string[];
  disabled?: boolean;
  // "sm" : pastille compacte pour une barre d'outils (text-format-toolbar.tsx).
  // "md" (défaut) : pleine largeur, pour un panneau de propriétés.
  size?: "sm" | "md";
}) {
  const { theme } = useDashboardTheme();
  const [open, setOpen] = useState(false);
  const [favorites, setFavorites] = useState<string[]>(() => readStringList(FAVORITE_COLORS_KEY));
  const containerRef = useRef<HTMLDivElement>(null);

  // Lu directement pendant le rendu plutôt que copié dans un state
  // synchronisé par effet (lecture localStorage synchrone et bon marché) —
  // se rafraîchit naturellement à chaque ouverture du popover.
  const recentColors = open ? readStringList(RECENT_COLORS_KEY) : [];

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function choose(color: string) {
    onChange(color);
    pushRecentColor(color);
    setOpen(false);
  }

  function commitHexDraft(raw: string) {
    const trimmed = raw.trim();
    if (HEX_PATTERN.test(trimmed)) choose(trimmed);
  }

  function toggleFavorite(color: string) {
    setFavorites((current) => {
      const next = current.includes(color) ? current.filter((existing) => existing !== color) : [...current, color];
      writeStringList(FAVORITE_COLORS_KEY, next);
      return next;
    });
  }

  // Dédupliqué : primaryColor et secondaryColor sont identiques dans le
  // thème clair par défaut (#2F7A6E) — sans ça, deux boutons de couleur
  // partageraient la même key React ("two children with the same key").
  const animeoColors = Array.from(new Set([theme.primaryColor, theme.secondaryColor, theme.accentColor]));
  const uniqueDocumentColors = Array.from(new Set(documentColors)).slice(0, 12);
  const isCurrentValueFavorite = HEX_PATTERN.test(value) && favorites.includes(value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-expanded={open}
        title={label}
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className={
          size === "sm"
            ? "h-6 w-6 cursor-pointer rounded border border-neutral-200 p-0 disabled:cursor-not-allowed disabled:opacity-50"
            : "h-9 w-full cursor-pointer rounded-lg border border-animeo-border bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <span aria-hidden="true" className="block h-full w-full rounded" style={{ backgroundColor: value || "#ffffff" }} />
      </button>

      {open ? (
        <div role="dialog" aria-label={label} className="absolute left-0 top-full z-20 mt-1 w-56 space-y-3 rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
          <ColorWheel hex={HEX_PATTERN.test(value) ? value : "#4FAF9F"} onChange={onChange} onChangeEnd={pushRecentColor} />

          <div className="flex items-center gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wide text-neutral-500">Hex</span>
              <input
                key={value}
                type="text"
                defaultValue={value}
                onBlur={(event) => commitHexDraft(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitHexDraft(event.currentTarget.value); } }}
                className="h-7 min-w-0 flex-1 rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 outline-none focus:border-animeo"
              />
            </label>
            <button
              type="button"
              aria-label={isCurrentValueFavorite ? "Retirer des favoris" : "Ajouter aux favoris"}
              aria-pressed={isCurrentValueFavorite}
              disabled={!HEX_PATTERN.test(value)}
              onClick={() => toggleFavorite(value)}
              className="shrink-0 text-base text-amber-500 disabled:cursor-not-allowed disabled:opacity-30"
            >
              {isCurrentValueFavorite ? "★" : "☆"}
            </button>
          </div>

          {favorites.length > 0 ? <ColorSwatchRow label="Couleurs favorites" colors={favorites} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} /> : null}
          {uniqueDocumentColors.length > 0 ? <ColorSwatchRow label="Couleurs du document" colors={uniqueDocumentColors} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} /> : null}
          <ColorSwatchRow label="Couleurs 1002 Pattes" colors={animeoColors} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} />
          {recentColors.length > 0 ? <ColorSwatchRow label="Couleurs récentes" colors={recentColors} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ColorSwatchRow({
  label,
  colors,
  favorites,
  onChoose,
  onToggleFavorite,
}: {
  label: string;
  colors: string[];
  favorites: string[];
  onChoose: (color: string) => void;
  onToggleFavorite: (color: string) => void;
}) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => {
          const isFavorite = favorites.includes(color);
          return (
            <span key={color} className="relative">
              <button
                type="button"
                aria-label={color}
                title={color}
                onClick={() => onChoose(color)}
                className="h-6 w-6 rounded border border-neutral-200"
                style={{ backgroundColor: color }}
              />
              <button
                type="button"
                aria-label={isFavorite ? `Retirer ${color} des favoris` : `Ajouter ${color} aux favoris`}
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite(color)}
                className="absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-white text-[9px] leading-none text-amber-500 shadow-sm"
              >
                {isFavorite ? "★" : "☆"}
              </button>
            </span>
          );
        })}
      </div>
    </div>
  );
}
