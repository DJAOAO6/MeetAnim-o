"use client";

import { useState } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, newElementId } from "@/components/documents/editor/element-factory";
import { STUDIO_ICONS, type StudioIcon, type StudioIconCategory } from "@/components/documents/editor/studio-icons";
import type { DocumentIconElement } from "@/lib/documents/content";

const CATEGORIES: StudioIconCategory[] = ["Contact", "Rendez-vous", "Animal", "Consultation", "Santé", "Cabinet"];
const ICON_SIZE = 48;
const DEFAULT_COLOR = "#183b45";

function groupByCategory(icons: StudioIcon[]): [StudioIconCategory, StudioIcon[]][] {
  return CATEGORIES.map((category) => [category, icons.filter((icon) => icon.category === category)] as [StudioIconCategory, StudioIcon[]]).filter(
    ([, icons]) => icons.length > 0,
  );
}

/**
 * Bibliothèque d'icônes cherchable (étape 23) — insertion directe comme les
 * formes/lignes (pas de popover à ouvrir), recherche + groupes de catégorie
 * comme "Données Animéo" (animeo-data-panel.tsx). Chaque icône devient un
 * DocumentIconElement (content.ts), rendu comme un Konva Path monochrome —
 * couleur/épaisseur réglables ensuite depuis Propriétés, comme une forme.
 */
export function IconsPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);
  const [search, setSearch] = useState("");

  function insert(icon: StudioIcon) {
    const element: DocumentIconElement = {
      id: newElementId("icon"),
      type: "icon",
      iconName: icon.name,
      ...DEFAULT_POSITION,
      width: ICON_SIZE,
      height: ICON_SIZE,
      rotation: 0,
      color: DEFAULT_COLOR,
    };
    addElement(element);
  }

  const query = search.trim().toLocaleLowerCase("fr-FR");
  const filtered = query ? STUDIO_ICONS.filter((icon) => icon.name.toLocaleLowerCase("fr-FR").includes(query)) : STUDIO_ICONS;
  const groups = groupByCategory(filtered);

  return (
    <StudioPanel id="studio-panel-icons" title="Icônes">
      <label className="block">
        <span className="sr-only">Rechercher une icône</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher…"
          className="h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-800 outline-none focus:border-animeo focus:bg-white"
        />
      </label>

      {groups.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune icône ne correspond à « {search} ».</p>
      ) : (
        <div className="space-y-4">
          {groups.map(([category, icons]) => (
            <div key={category}>
              <StudioSectionLabel>{category}</StudioSectionLabel>
              <div className="grid grid-cols-3 gap-2">
                {icons.map((icon) => (
                  <button
                    key={icon.name}
                    type="button"
                    onClick={() => insert(icon)}
                    disabled={readOnly}
                    className="flex flex-col items-center gap-1.5 rounded-md border border-neutral-200 px-2 py-3 text-[11px] font-semibold text-neutral-700 transition hover:border-animeo hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                      <path d={icon.path} />
                    </svg>
                    {icon.name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </StudioPanel>
  );
}
