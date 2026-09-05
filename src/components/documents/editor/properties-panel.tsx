"use client";

import { useDocumentStore } from "@/components/documents/editor/document-store";
import { updateMarkerPresetsAction } from "@/lib/documents/marker-presets-actions";
import type { DocumentDiagramElement } from "@/lib/documents/content";

const numberFieldClassName = "h-9 w-full rounded-lg border border-[#d9e5e2] bg-animeo-bg px-2.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white";

export function PropertiesPanel({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementId = useDocumentStore((state) => state.selectedElementId);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const duplicateSelected = useDocumentStore((state) => state.duplicateSelected);
  const removeSelected = useDocumentStore((state) => state.removeSelected);

  const page = content.pages[currentPageIndex];
  const element = page?.elements.find((item) => item.id === selectedElementId);

  if (!element) {
    return (
      <aside className="hidden w-64 shrink-0 border-l border-[#dce8e5] bg-white p-4 lg:block">
        <p className="text-sm text-animeo-muted">Sélectionnez un élément pour modifier ses propriétés.</p>
      </aside>
    );
  }

  return (
    <aside className="hidden w-64 shrink-0 space-y-5 overflow-y-auto border-l border-[#dce8e5] bg-white p-4 lg:block">
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Position</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" ariaLabel="Position X" value={element.x} onChange={(value) => updateElement(element.id, { x: value })} disabled={readOnly} />
          <NumberField label="Y" ariaLabel="Position Y" value={element.y} onChange={(value) => updateElement(element.id, { y: value })} disabled={readOnly} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Taille</p>
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="L" ariaLabel="Largeur" value={element.width} onChange={(value) => updateElement(element.id, { width: Math.max(20, value) })} disabled={readOnly} />
          <NumberField label="H" ariaLabel="Hauteur" value={element.height} onChange={(value) => updateElement(element.id, { height: Math.max(20, value) })} disabled={readOnly} />
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Rotation</p>
        <NumberField label="°" ariaLabel="Rotation" value={element.rotation} onChange={(value) => updateElement(element.id, { rotation: value })} disabled={readOnly} />
      </div>

      {element.type === "shape" ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Style</p>
          <div className="grid grid-cols-2 gap-2">
            <ColorField label="Remplissage" value={element.fill} onChange={(value) => updateElement(element.id, { fill: value })} disabled={readOnly} />
            <ColorField label="Contour" value={element.stroke} onChange={(value) => updateElement(element.id, { stroke: value })} disabled={readOnly} />
          </div>
        </div>
      ) : null}

      {element.type === "diagram" ? <DiagramProperties element={element} readOnly={readOnly} /> : null}

      {!readOnly ? (
        <div className="flex gap-2 border-t border-[#e5eeeb] pt-4">
          <button type="button" onClick={duplicateSelected} className="flex-1 rounded-xl border border-[#d4e2df] px-3 py-2 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
            Dupliquer
          </button>
          <button type="button" onClick={removeSelected} className="flex-1 rounded-xl border border-[#f3c9c9] bg-[#fff1f1] px-3 py-2 text-xs font-extrabold text-animeo-error transition hover:bg-[#ffe0e0]">
            Supprimer
          </button>
        </div>
      ) : null}
    </aside>
  );
}

function NumberField({ label, ariaLabel, value, onChange, disabled }: { label: string; ariaLabel: string; value: number; onChange: (value: number) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-animeo-muted" aria-hidden="true">{label}</span>
      <input
        aria-label={ariaLabel}
        type="number"
        value={Math.round(value)}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        className={numberFieldClassName}
      />
    </label>
  );
}

function ColorField({ label, value, onChange, disabled }: { label: string; value: string; onChange: (value: string) => void; disabled: boolean }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-bold text-animeo-muted">{label}</span>
      <input
        type="color"
        value={value || "#ffffff"}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-9 w-full cursor-pointer rounded-lg border border-[#d9e5e2] bg-white p-1"
      />
    </label>
  );
}

/**
 * Panneau du schéma animalier (étape 4) : choix du préréglage à poser (le
 * clic effectif a lieu sur le canvas, voir canvas-stage.tsx), liste des
 * repères déjà posés (suppression uniquement ici, pas de glisser sur le
 * canvas — hors périmètre Phase 1), bascule de la légende, et renommage des
 * préréglages (partagés par tout le cabinet, voir marker-presets-actions.ts
 * — un repère déjà posé garde son libellé d'origine, jamais changé
 * rétroactivement).
 */
function DiagramProperties({ element, readOnly }: { element: DocumentDiagramElement; readOnly: boolean }) {
  const markerPresets = useDocumentStore((state) => state.markerPresets);
  const setMarkerPresets = useDocumentStore((state) => state.setMarkerPresets);
  const placingMarkerPresetId = useDocumentStore((state) => state.placingMarkerPresetId);
  const setPlacingMarkerPreset = useDocumentStore((state) => state.setPlacingMarkerPreset);
  const updateElement = useDocumentStore((state) => state.updateElement);

  function removeMarker(markerId: string) {
    updateElement(element.id, { markers: element.markers.filter((marker) => marker.id !== markerId) });
  }

  async function renamePreset(presetId: string, label: string) {
    const next = markerPresets.map((preset) => (preset.id === presetId ? { ...preset, label } : preset));
    setMarkerPresets(next);
    await updateMarkerPresetsAction(next);
  }

  return (
    <>
      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Repères</p>
        {placingMarkerPresetId ? (
          <p className="mb-2 rounded-lg bg-animeo-soft px-2.5 py-2 text-[11px] font-bold text-animeo-dark">Cliquez sur le schéma pour poser le repère…</p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {markerPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={readOnly}
              onClick={() => setPlacingMarkerPreset(placingMarkerPresetId === preset.id ? null : preset.id)}
              className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                placingMarkerPresetId === preset.id ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"
              }`}
            >
              <span aria-hidden="true" className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: preset.color }} />
              {preset.label}
            </button>
          ))}
        </div>
      </div>

      {element.markers.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Repères posés</p>
          <ul className="space-y-1">
            {element.markers.map((marker, index) => (
              <li key={marker.id} className="flex items-center justify-between gap-2 rounded-lg bg-animeo-bg px-2.5 py-1.5 text-[11px] font-semibold text-animeo-dark">
                <span className="truncate">{index + 1}. {marker.label}</span>
                {!readOnly ? (
                  <button type="button" onClick={() => removeMarker(marker.id)} aria-label={`Supprimer le repère ${index + 1}`} className="shrink-0 text-animeo-error">
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
        <input type="checkbox" checked={element.showLegend} disabled={readOnly} onChange={(event) => updateElement(element.id, { showLegend: event.target.checked })} />
        Afficher la légende
      </label>

      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Renommer les repères</p>
        <div className="space-y-1.5">
          {markerPresets.map((preset) => (
            <label key={preset.id} className="flex items-center gap-1.5">
              <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: preset.color }} />
              <input
                aria-label={`Renommer le repère ${preset.label}`}
                defaultValue={preset.label}
                disabled={readOnly}
                onBlur={(event) => {
                  const value = event.target.value.trim();
                  if (value && value !== preset.label) renamePreset(preset.id, value);
                }}
                className="h-8 w-full rounded-lg border border-[#d9e5e2] bg-animeo-bg px-2 text-[11px] font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white"
              />
            </label>
          ))}
        </div>
      </div>
    </>
  );
}
