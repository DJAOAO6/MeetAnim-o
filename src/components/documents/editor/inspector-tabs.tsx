"use client";

import { useState } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { PropertiesPanel } from "@/components/documents/editor/properties-panel";
import { LayersPanel } from "@/components/documents/editor/layers-panel";

type InspectorTab = "properties" | "layers";

/**
 * Onglets Propriétés/Calques (étape 11) — remplace l'affichage permanent de
 * `PropertiesPanel` seul (étapes 2-10). L'onglet "Pages" esquissé dans le
 * brief est volontairement absent : la barre de pages en pied de canevas
 * (étape 10) couvre déjà ce besoin, une deuxième surface serait redondante.
 *
 * Version tablette (< lg) : rattrape ce qui avait été explicitement différé
 * à l'étape 6 — un bouton flottant ouvre le même contenu en feuille du bas
 * quand un élément est sélectionné.
 */
export function InspectorTabs({ readOnly }: { readOnly: boolean }) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("properties");
  const [mobileOpen, setMobileOpen] = useState(false);
  const selectedElementId = useDocumentStore((state) => state.selectedElementId);

  return (
    <>
      <aside className="hidden w-64 shrink-0 flex-col border-l border-neutral-200 bg-white lg:flex">
        <InspectorTabContent activeTab={activeTab} onTabChange={setActiveTab} readOnly={readOnly} />
      </aside>

      {selectedElementId && !mobileOpen ? (
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          className="fixed bottom-20 right-4 z-20 rounded-md bg-animeo px-4 py-2.5 text-sm font-semibold text-white shadow-sm lg:hidden"
        >
          Propriétés
        </button>
      ) : null}

      {mobileOpen ? (
        <div className="fixed inset-0 z-30 flex items-end bg-black/30 lg:hidden" role="presentation" onClick={() => setMobileOpen(false)}>
          <div
            role="dialog"
            aria-label="Propriétés et calques"
            onClick={(event) => event.stopPropagation()}
            className="flex max-h-[70vh] w-full flex-col overflow-hidden rounded-t-lg border-t border-neutral-200 bg-white shadow-sm"
          >
            <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-2.5">
              <span className="text-sm font-bold text-neutral-800">Inspecteur</span>
              <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer" className="text-xl leading-none text-neutral-500">×</button>
            </div>
            <div className="overflow-y-auto">
              <InspectorTabContent activeTab={activeTab} onTabChange={setActiveTab} readOnly={readOnly} />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function InspectorTabContent({ activeTab, onTabChange, readOnly }: { activeTab: InspectorTab; onTabChange: (tab: InspectorTab) => void; readOnly: boolean }) {
  return (
    <>
      <div role="tablist" className="flex border-b border-neutral-200">
        <TabButton label="Propriétés" active={activeTab === "properties"} onClick={() => onTabChange("properties")} />
        <TabButton label="Calques" active={activeTab === "layers"} onClick={() => onTabChange("layers")} />
      </div>
      <div className="flex-1 overflow-y-auto">
        {activeTab === "properties" ? <PropertiesPanel readOnly={readOnly} /> : <LayersPanel readOnly={readOnly} />}
      </div>
    </>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`flex-1 border-b-2 px-3 py-2.5 text-sm font-semibold transition ${active ? "border-animeo text-animeo-dark" : "border-transparent text-neutral-500 hover:text-neutral-700"}`}
    >
      {label}
    </button>
  );
}
