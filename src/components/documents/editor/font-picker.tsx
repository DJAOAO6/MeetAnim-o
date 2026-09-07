"use client";

import { useEffect, useRef, useState } from "react";
import { STUDIO_FONTS, studioFontByCssVar, type StudioFont, type StudioFontCategory } from "@/components/documents/editor/studio-fonts";

const FAVORITE_FONTS_KEY = "animeo-studio-favorite-fonts-v1";
const RECENT_FONTS_KEY = "animeo-studio-recent-fonts-v1";
const MAX_RECENT_FONTS = 6;

const CATEGORIES: StudioFontCategory[] = ["Sans Serif", "Serif", "Condensée"];

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
    // Stockage indisponible — dégrade silencieusement, choisir une police
    // reste fonctionnel sans favoris/récentes persistés.
  }
}

function pushRecentFont(name: string) {
  const next = [name, ...readStringList(RECENT_FONTS_KEY).filter((existing) => existing !== name)].slice(0, MAX_RECENT_FONTS);
  writeStringList(RECENT_FONTS_KEY, next);
}

/**
 * Sélecteur de police (étape 17) — recherche, favoris et récentes en
 * localStorage (même convention que ColorPicker), groupé par catégorie
 * (Sans Serif/Serif/Condensée). `value`/`onChange` portent la variable CSS
 * (`var(--font-poppins)`), jamais le nom lisible : c'est ce que Tiptap
 * sérialise dans le HTML (`setFontFamily`), et ce qui résout réellement vers
 * la police auto-hébergée par next/font/google (voir studio-fonts.ts).
 */
export function FontPicker({ value, onChange }: { value: string; onChange: (cssVar: string) => void }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [favorites, setFavorites] = useState<string[]>(() => readStringList(FAVORITE_FONTS_KEY));
  const containerRef = useRef<HTMLDivElement>(null);

  const recents = open ? readStringList(RECENT_FONTS_KEY) : [];

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

  function choose(font: StudioFont) {
    onChange(font.cssVar);
    pushRecentFont(font.name);
    setOpen(false);
    setSearch("");
  }

  function toggleFavorite(name: string) {
    setFavorites((current) => {
      const next = current.includes(name) ? current.filter((existing) => existing !== name) : [...current, name];
      writeStringList(FAVORITE_FONTS_KEY, next);
      return next;
    });
  }

  const query = search.trim().toLowerCase();
  const filtered = query ? STUDIO_FONTS.filter((font) => font.name.toLowerCase().includes(query)) : STUDIO_FONTS;
  const favoriteFonts = STUDIO_FONTS.filter((font) => favorites.includes(font.name));
  const recentFonts = recents.map((name) => STUDIO_FONTS.find((font) => font.name === name)).filter((font): font is StudioFont => Boolean(font));
  const currentFont = studioFontByCssVar(value);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Police"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        style={currentFont ? { fontFamily: currentFont.cssVar } : undefined}
        className="flex h-6 w-28 shrink-0 items-center rounded border border-neutral-200 px-2 text-xs font-semibold text-neutral-700 hover:bg-neutral-50"
      >
        <span className="truncate">{currentFont?.name ?? "Police"}</span>
      </button>

      {open ? (
        <div role="dialog" aria-label="Police" className="absolute left-0 top-full z-20 mt-1 max-h-80 w-64 overflow-y-auto rounded-md border border-neutral-200 bg-white p-2 shadow-sm">
          <input
            type="text"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une police…"
            aria-label="Rechercher une police"
            className="mb-2 h-8 w-full rounded border border-neutral-200 px-2 text-xs outline-none focus:border-animeo"
          />

          {!query && favoriteFonts.length > 0 ? (
            <FontGroup label="⭐ Favoris" fonts={favoriteFonts} value={value} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} />
          ) : null}
          {!query && recentFonts.length > 0 ? (
            <FontGroup label="Récentes" fonts={recentFonts} value={value} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} />
          ) : null}

          {CATEGORIES.map((category) => {
            const fontsInCategory = filtered.filter((font) => font.category === category);
            if (fontsInCategory.length === 0) return null;
            return (
              <FontGroup key={category} label={category} fonts={fontsInCategory} value={value} favorites={favorites} onChoose={choose} onToggleFavorite={toggleFavorite} />
            );
          })}

          {filtered.length === 0 ? <p className="px-1 py-2 text-xs text-neutral-500">Aucune police trouvée.</p> : null}
        </div>
      ) : null}
    </div>
  );
}

function FontGroup({
  label,
  fonts,
  value,
  favorites,
  onChoose,
  onToggleFavorite,
}: {
  label: string;
  fonts: StudioFont[];
  value: string;
  favorites: string[];
  onChoose: (font: StudioFont) => void;
  onToggleFavorite: (name: string) => void;
}) {
  return (
    <div className="mb-2">
      <p className="mb-1 px-1 text-[10px] font-bold uppercase tracking-wide text-neutral-500">{label}</p>
      <ul>
        {fonts.map((font) => {
          const isFavorite = favorites.includes(font.name);
          return (
            <li key={font.name} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => onChoose(font)}
                aria-pressed={font.cssVar === value}
                style={{ fontFamily: font.cssVar }}
                className={`flex-1 truncate rounded px-2 py-1.5 text-left text-sm ${font.cssVar === value ? "bg-animeo-soft text-animeo-dark" : "text-neutral-700 hover:bg-neutral-50"}`}
              >
                {font.name}
              </button>
              <button
                type="button"
                aria-label={isFavorite ? `Retirer ${font.name} des favoris` : `Ajouter ${font.name} aux favoris`}
                aria-pressed={isFavorite}
                onClick={() => onToggleFavorite(font.name)}
                className="shrink-0 px-1.5 text-sm text-amber-500"
              >
                {isFavorite ? "★" : "☆"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
