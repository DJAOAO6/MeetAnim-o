"use client";

import { useDocumentStore, type SidebarCategory } from "@/components/documents/editor/document-store";
import { TemplatesPanel } from "@/components/documents/editor/panels/templates-panel";
import { TextPanel } from "@/components/documents/editor/panels/text-panel";
import { ShapesPanel } from "@/components/documents/editor/panels/shapes-panel";
import { LinesPanel } from "@/components/documents/editor/panels/lines-panel";
import { IconsPanel } from "@/components/documents/editor/panels/icons-panel";
import { ImagesPanel } from "@/components/documents/editor/panels/images-panel";
import { DiagramPanel } from "@/components/documents/editor/panels/diagram-panel";
import { SmartBlocksPanel } from "@/components/documents/editor/panels/smart-blocks-panel";
import { AnimeoDataPanel } from "@/components/documents/editor/panels/animeo-data-panel";

const CATEGORIES: { id: SidebarCategory; label: string; icon: React.ReactNode }[] = [
  { id: "templates", label: "Modèles", icon: <TemplatesIcon /> },
  { id: "text", label: "Texte", icon: <TextIcon /> },
  { id: "shapes", label: "Formes", icon: <ShapesIcon /> },
  { id: "lines", label: "Lignes", icon: <LinesIcon /> },
  { id: "icons", label: "Icônes", icon: <IconsCategoryIcon /> },
  { id: "images", label: "Images", icon: <ImageIcon /> },
  { id: "diagram", label: "Schémas", icon: <DogIcon /> },
  { id: "blocks", label: "Blocs", icon: <BlocksIcon /> },
  { id: "data", label: "Données", icon: <DataIcon /> },
];

/**
 * Rail d'icônes du Studio (étape 6) — remplace l'ancienne barre latérale
 * `EditorToolbar` toujours dépliée. Ouvre/ferme un seul panneau contextuel à
 * la fois ; le panneau flotte au-dessus du canevas sur tablette (`md`) et le
 * pousse à partir de `lg`, voir le conteneur parent (document-editor-view.tsx).
 * Les boutons du rail restent toujours cliquables même en lecture seule (ils
 * ne font qu'afficher/masquer un panneau) — seules les actions d'insertion à
 * l'intérieur des panneaux sont désactivées par `readOnly`.
 */
export function StudioSidebar({ readOnly }: { readOnly: boolean }) {
  const openSidebarCategory = useDocumentStore((state) => state.openSidebarCategory);
  const setSidebarCategory = useDocumentStore((state) => state.setSidebarCategory);

  function toggle(category: SidebarCategory) {
    setSidebarCategory(openSidebarCategory === category ? null : category);
  }

  return (
    <div className="relative flex h-full shrink-0">
      <nav className="flex w-14 shrink-0 flex-col items-center gap-1 border-r border-neutral-200 bg-white py-3" aria-label="Outils du Studio">
        {CATEGORIES.map((category) => (
          <button
            key={category.id}
            type="button"
            aria-expanded={openSidebarCategory === category.id}
            aria-controls={`studio-panel-${category.id}`}
            onClick={() => toggle(category.id)}
            className={`flex h-12 w-12 flex-col items-center justify-center gap-0.5 rounded-md text-[9px] font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-animeo focus-visible:ring-offset-2 ${
              openSidebarCategory === category.id ? "bg-animeo-soft text-animeo-dark" : "text-neutral-500 hover:bg-neutral-100 hover:text-neutral-800"
            }`}
          >
            {category.icon}
            {category.label}
          </button>
        ))}
      </nav>

      {openSidebarCategory ? (
        <div className="absolute inset-y-0 left-14 z-10 shadow-sm lg:relative lg:inset-auto lg:left-auto lg:z-auto lg:shadow-none">
          {openSidebarCategory === "templates" ? <TemplatesPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "text" ? <TextPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "shapes" ? <ShapesPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "lines" ? <LinesPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "icons" ? <IconsPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "images" ? <ImagesPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "diagram" ? <DiagramPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "blocks" ? <SmartBlocksPanel readOnly={readOnly} /> : null}
          {openSidebarCategory === "data" ? <AnimeoDataPanel readOnly={readOnly} /> : null}
        </div>
      ) : null}
    </div>
  );
}

function TemplatesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="4" y="3" width="16" height="18" rx="1.5" />
      <path d="M8 8h8M8 12h8M8 16h5" />
    </svg>
  );
}

function TextIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5"><path d="M5 5h14M12 5v14" /></svg>;
}

function ShapesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="9" cy="9" r="4.5" />
      <rect x="12.5" y="12.5" width="8" height="8" rx="1.5" />
    </svg>
  );
}

function LinesIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M4 8h16M13 4l7 4-7 4" />
    </svg>
  );
}

function IconsCategoryIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z M21 21l-4.3-4.3" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <circle cx="9" cy="9" r="1.5" />
      <path d="m21 15-5-5-11 11" />
    </svg>
  );
}

function DogIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
      <path d="M6 10c-1.5-1-2.5-.5-2.5 1S5 13 6 12.5" />
      <path d="M6 10c0-3 2.5-5 6-5s6 2.5 6 6c0 3-1.5 4.5-1.5 7.5H8c0-2.5-2-3.5-2-6.5Z" />
      <circle cx="9.5" cy="9.5" r="0.8" fill="currentColor" />
    </svg>
  );
}

function BlocksIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <rect x="3.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="3.5" width="7" height="7" rx="1.2" />
      <rect x="3.5" y="13.5" width="7" height="7" rx="1.2" />
      <rect x="13.5" y="13.5" width="7" height="7" rx="1.2" />
    </svg>
  );
}

function DataIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="h-5 w-5">
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
      <path d="M4.5 11.5v6c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-6" />
    </svg>
  );
}
