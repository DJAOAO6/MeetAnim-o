"use client";

import { useDocumentStore, useSelectedElementId } from "@/components/documents/editor/document-store";
import { updateMarkerPresetsAction } from "@/lib/documents/marker-presets-actions";
import { ColorPicker } from "@/components/documents/editor/color-picker";
import { collectDocumentColors, type DocumentDiagramElement } from "@/lib/documents/content";

const numberFieldClassName = "h-9 w-full rounded-lg border border-[#d9e5e2] bg-animeo-bg px-2.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white";

export function PropertiesPanel({ readOnly }: { readOnly: boolean }) {
  const content = useDocumentStore((state) => state.content);
  const currentPageIndex = useDocumentStore((state) => state.currentPageIndex);
  const selectedElementId = useSelectedElementId();
  const selectedCount = useDocumentStore((state) => state.selectedElementIds.length);
  const updateElement = useDocumentStore((state) => state.updateElement);
  const duplicateSelected = useDocumentStore((state) => state.duplicateSelected);
  const removeSelected = useDocumentStore((state) => state.removeSelected);
  const setPageBackground = useDocumentStore((state) => state.setPageBackground);

  const page = content.pages[currentPageIndex];
  const element = page?.elements.find((item) => item.id === selectedElementId);
  const documentColors = collectDocumentColors(content);

  // Sélection multiple (étape 13) : pas d'édition de propriétés groupée dans
  // ce chantier (voir le plan, hors périmètre) — seulement dupliquer/
  // supprimer, déjà multi-capables côté store. La barre d'alignement
  // (étape 14) s'affiche séparément, ancrée à la sélection.
  if (selectedCount > 1) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm font-semibold text-animeo-dark">{selectedCount} éléments sélectionnés</p>
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
      </div>
    );
  }

  // Fond de page (étape 16) : affiché quand aucun élément n'est sélectionné,
  // plutôt qu'un simple message — la page elle-même est alors "sélectionnée"
  // au sens propriétés. Couleur unie uniquement, voir content.ts.
  if (!element && page) {
    return (
      <div className="space-y-4 p-4">
        <p className="text-sm text-animeo-muted">Sélectionnez un élément pour modifier ses propriétés.</p>
        <div className="border-t border-[#e5eeeb] pt-4">
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Fond de page</p>
          <div className="flex items-center gap-2">
            <div className="w-16">
              <ColorPicker
                label="Fond de page"
                value={page.background?.value ?? "#ffffff"}
                onChange={(color) => setPageBackground(currentPageIndex, color)}
                documentColors={documentColors}
                disabled={readOnly}
              />
            </div>
            {page.background ? (
              <button
                type="button"
                onClick={() => setPageBackground(currentPageIndex, null)}
                disabled={readOnly}
                className="text-xs font-bold text-animeo-muted underline decoration-dotted hover:text-animeo-dark disabled:cursor-not-allowed disabled:opacity-40"
              >
                Retirer le fond
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  if (!element) return null;

  return (
    <div className="space-y-5 p-4">
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
            <div>
              <span className="mb-1 block text-[10px] font-bold text-animeo-muted">Remplissage</span>
              <ColorPicker label="Remplissage" value={element.fill} onChange={(value) => updateElement(element.id, { fill: value })} documentColors={documentColors} disabled={readOnly} />
            </div>
            <div>
              <span className="mb-1 block text-[10px] font-bold text-animeo-muted">Contour</span>
              <ColorPicker label="Contour" value={element.stroke} onChange={(value) => updateElement(element.id, { stroke: value })} documentColors={documentColors} disabled={readOnly} />
            </div>
            <NumberField
              label="Épais."
              ariaLabel="Épaisseur de contour"
              value={element.strokeWidth ?? (element.shape === "line" ? 2 : 1)}
              onChange={(value) => updateElement(element.id, { strokeWidth: Math.max(0, value) })}
              disabled={readOnly}
            />
            {element.shape === "rect" ? (
              <NumberField
                label="Rayon"
                ariaLabel="Rayon d'angle"
                value={element.cornerRadius ?? 4}
                onChange={(value) => updateElement(element.id, { cornerRadius: Math.max(0, value) })}
                disabled={readOnly}
              />
            ) : null}
          </div>

          {["line", "arrow", "chevron"].includes(element.shape) ? (
            <label className="mt-2 flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
              <input
                type="checkbox"
                checked={element.dashed ?? false}
                disabled={readOnly}
                onChange={(event) => updateElement(element.id, { dashed: event.target.checked })}
              />
              Pointillé
            </label>
          ) : null}

          {element.shape === "arrow" ? (
            <label className="mt-2 flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
              <input
                type="checkbox"
                checked={element.doubleArrow ?? false}
                disabled={readOnly}
                onChange={(event) => updateElement(element.id, { doubleArrow: event.target.checked })}
              />
              Double flèche
            </label>
          ) : null}
        </div>
      ) : null}

      {element.type === "icon" ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Style</p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <span className="mb-1 block text-[10px] font-bold text-animeo-muted">Couleur</span>
              <ColorPicker label="Couleur de l'icône" value={element.color} onChange={(value) => updateElement(element.id, { color: value })} documentColors={documentColors} disabled={readOnly} />
            </div>
            <NumberField
              label="Épais."
              ariaLabel="Épaisseur de trait"
              value={element.strokeWidth ?? 1.8}
              onChange={(value) => updateElement(element.id, { strokeWidth: Math.max(0, value) })}
              disabled={readOnly}
            />
          </div>
        </div>
      ) : null}

      <div>
        <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">Opacité</p>
        <div className="flex items-center gap-2">
          <input
            aria-label="Opacité"
            type="range"
            min={0}
            max={100}
            step={1}
            value={Math.round((element.opacity ?? 1) * 100)}
            disabled={readOnly}
            onChange={(event) => updateElement(element.id, { opacity: Number(event.target.value) / 100 })}
            className="h-2 flex-1 accent-animeo"
          />
          <span className="w-10 shrink-0 text-right text-xs font-bold text-animeo-dark">{Math.round((element.opacity ?? 1) * 100)}%</span>
        </div>
      </div>

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
    </div>
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
