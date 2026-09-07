"use client";

import { useEffect, useRef, useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";

const RECENT_COLORS_KEY = "animeo-studio-recent-colors-v1";
const MAX_RECENT_COLORS = 8;
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

function readRecentColors(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENT_COLORS_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : [];
  } catch {
    return [];
  }
}

function pushRecentColor(color: string) {
  try {
    const next = [color, ...readRecentColors().filter((existing) => existing !== color)].slice(0, MAX_RECENT_COLORS);
    window.localStorage.setItem(RECENT_COLORS_KEY, JSON.stringify(next));
  } catch {
    // Stockage indisponible (navigation privée, quota...) — dégrade
    // silencieusement, choisir une couleur reste fonctionnel sans historique.
  }
}

/**
 * Sélecteur de couleur réutilisable (étape 16) — remplace les
 * `<input type="color">` bruts (fond de forme/contour dans properties-panel.tsx,
 * couleur de texte dans text-format-toolbar.tsx, fond de page). Une seule
 * implémentation partagée : "Couleurs du document" (dérivées du contenu réel,
 * voir collectDocumentColors), "Couleurs Animéo" (thème du compte,
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
  const containerRef = useRef<HTMLDivElement>(null);

  // Lu directement pendant le rendu plutôt que copié dans un state
  // synchronisé par effet (lecture localStorage synchrone et bon marché) —
  // se rafraîchit naturellement à chaque ouverture du popover.
  const recentColors = open ? readRecentColors() : [];

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

  const animeoColors = [theme.primaryColor, theme.secondaryColor, theme.accentColor];
  const uniqueDocumentColors = Array.from(new Set(documentColors)).slice(0, 12);

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
            : "h-9 w-full cursor-pointer rounded-lg border border-[#d9e5e2] bg-white p-1 disabled:cursor-not-allowed disabled:opacity-50"
        }
      >
        <span aria-hidden="true" className="block h-full w-full rounded" style={{ backgroundColor: value || "#ffffff" }} />
      </button>

      {open ? (
        <div role="dialog" aria-label={label} className="absolute left-0 top-full z-20 mt-1 w-56 space-y-3 rounded-md border border-neutral-200 bg-white p-3 shadow-sm">
          <label className="flex items-center gap-2">
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

          {uniqueDocumentColors.length > 0 ? <ColorSwatchRow label="Couleurs du document" colors={uniqueDocumentColors} onChoose={choose} /> : null}
          <ColorSwatchRow label="Couleurs Animéo" colors={animeoColors} onChoose={choose} />
          {recentColors.length > 0 ? <ColorSwatchRow label="Couleurs récentes" colors={recentColors} onChoose={choose} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function ColorSwatchRow({ label, colors, onChoose }: { label: string; colors: string[]; onChoose: (color: string) => void }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {colors.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            title={color}
            onClick={() => onChoose(color)}
            className="h-6 w-6 rounded border border-neutral-200"
            style={{ backgroundColor: color }}
          />
        ))}
      </div>
    </div>
  );
}
