"use client";

import { useMemo, useState } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { anatomyPath, findAnatomyNode, searchAnatomy, selectableAnatomyNodes } from "@/lib/anatomy/taxonomy";
import { AVAILABLE_ANATOMY_VIEWS, getAnatomyView, hitboxZoneIds } from "@/lib/anatomy/views";
import { colorForPreset, labelForPreset } from "@/lib/documents/marker-presets";
import type { AnatomyViewId } from "@/lib/anatomy/views";
import type { DocumentAnatomyElement } from "@/lib/documents/content";

/**
 * Propriétés d'un schéma anatomique (étape 31). Les TROIS façons de
 * sélectionner une zone exigées par le brief — clic sur le schéma,
 * autocomplete, liste anatomique — passent toutes par `selectAnatomyZone`
 * du store, donc par le même identifiant : elles ne peuvent pas diverger.
 */
export function AnatomyProperties({ element, readOnly }: { element: DocumentAnatomyElement; readOnly: boolean }) {
  const markerPresets = useDocumentStore((state) => state.markerPresets);
  const placingMarkerPresetId = useDocumentStore((state) => state.placingMarkerPresetId);
  const setPlacingMarkerPreset = useDocumentStore((state) => state.setPlacingMarkerPreset);
  const selectedZoneId = useDocumentStore((state) => state.selectedZoneId);
  const selectAnatomyZone = useDocumentStore((state) => state.selectAnatomyZone);
  const updateElement = useDocumentStore((state) => state.updateElement);

  const [query, setQuery] = useState("");
  const [listOpen, setListOpen] = useState(false);

  const view = getAnatomyView(element.viewId);
  const zonesInView = useMemo(() => (view ? hitboxZoneIds(view) : new Set<string>()), [view]);

  // Seules les zones réellement cartographiées dans la vue courante sont
  // proposées : suggérer une zone non cliquable laisserait croire à un clic
  // sans effet.
  const listedZones = useMemo(
    () => selectableAnatomyNodes("dog").filter((node) => zonesInView.has(node.id)),
    [zonesInView],
  );

  const searchResults = useMemo(() => {
    if (query.trim().length < 2) return [];
    return searchAnatomy("dog", query, 20).filter((node) => zonesInView.has(node.id)).slice(0, 6);
  }, [query, zonesInView]);

  if (!view) return null;

  function pickZone(zoneId: string) {
    selectAnatomyZone(element.id, zoneId);
    setQuery("");
  }

  function removeObservation(observationId: string) {
    updateElement(element.id, { observations: element.observations.filter((entry) => entry.id !== observationId) });
  }

  function updateNote(observationId: string, note: string) {
    updateElement(element.id, {
      observations: element.observations.map((entry) =>
        entry.id === observationId ? { ...entry, note: note.trim() || undefined } : entry,
      ),
    });
  }

  return (
    <>
      <div>
        <p className="mb-2 text-xs font-extrabold tracking-[0.08em] text-animeo-muted uppercase">Vue</p>
        <div className="flex gap-1.5">
          {AVAILABLE_ANATOMY_VIEWS.map((candidate) => (
            <button
              key={candidate.id}
              type="button"
              disabled={readOnly}
              aria-pressed={element.viewId === candidate.id}
              onClick={() => updateElement(element.id, { viewId: candidate.id as AnatomyViewId })}
              className={`flex-1 rounded-lg px-2 py-1.5 text-[11px] font-bold transition disabled:cursor-not-allowed disabled:opacity-40 ${
                element.viewId === candidate.id ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"
              }`}
            >
              {candidate.sideVisible === "left" ? "Latérale gauche" : "Latérale droite"}
            </button>
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs font-extrabold tracking-[0.08em] text-animeo-muted uppercase">Type d’observation</p>
        {placingMarkerPresetId ? (
          <p className="mb-2 rounded-lg bg-animeo-soft px-2.5 py-2 text-[11px] font-bold text-animeo-dark">
            Choisissez une zone : sur le schéma, par la recherche ou dans la liste.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {markerPresets.map((preset) => (
            <button
              key={preset.id}
              type="button"
              disabled={readOnly}
              aria-pressed={placingMarkerPresetId === preset.id}
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

      <div>
        <label htmlFor="anatomy-search" className="mb-2 block text-xs font-extrabold tracking-[0.08em] text-animeo-muted uppercase">
          Rechercher une zone
        </label>
        <input
          id="anatomy-search"
          type="search"
          value={query}
          disabled={readOnly}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Genou, grasset, C7…"
          className="h-9 w-full rounded-lg border border-[#d9e5e2] bg-animeo-bg px-2.5 text-[11px] font-semibold text-animeo-dark outline-none focus:border-animeo focus:bg-white"
        />
        {searchResults.length > 0 ? (
          <ul className="mt-1.5 space-y-1">
            {searchResults.map((node) => (
              <li key={node.id}>
                <button
                  type="button"
                  onClick={() => pickZone(node.id)}
                  className="flex w-full items-baseline justify-between gap-2 rounded-lg bg-animeo-bg px-2.5 py-1.5 text-left text-[11px] font-semibold text-animeo-dark transition hover:bg-animeo-soft"
                >
                  <span className="truncate">{node.label}</span>
                  <span className="shrink-0 text-[10px] font-normal text-animeo-muted">
                    {anatomyPath(node.id).slice(1, -1).map((step) => step.label).join(" › ")}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : null}
        {query.trim().length >= 2 && searchResults.length === 0 ? (
          <p className="mt-1.5 text-[11px] text-animeo-muted">Aucune zone de cette vue ne correspond.</p>
        ) : null}
      </div>

      <div>
        <button
          type="button"
          aria-expanded={listOpen}
          onClick={() => setListOpen(!listOpen)}
          className="flex w-full items-center justify-between text-xs font-extrabold tracking-[0.08em] text-animeo-muted uppercase"
        >
          Liste anatomique
          <span aria-hidden="true">{listOpen ? "−" : "+"}</span>
        </button>
        {listOpen ? (
          <ul className="mt-2 max-h-64 space-y-0.5 overflow-y-auto pr-1">
            {listedZones.map((node) => {
              const observation = element.observations.find((entry) => entry.zoneId === node.id);
              return (
                <li key={node.id}>
                  <button
                    type="button"
                    onClick={() => pickZone(node.id)}
                    aria-pressed={selectedZoneId === node.id}
                    className={`flex w-full items-center gap-1.5 rounded-lg px-2 py-1 text-left text-[11px] font-semibold transition ${
                      selectedZoneId === node.id ? "bg-animeo-soft text-animeo-dark" : "text-animeo-dark hover:bg-animeo-bg"
                    }`}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: observation ? colorForPreset(observation.presetId, markerPresets) : "#d9e5e2" }}
                    />
                    <span className="truncate">{node.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>

      {element.observations.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-extrabold tracking-[0.08em] text-animeo-muted uppercase">
            Observations ({element.observations.length})
          </p>
          <ul className="space-y-1.5">
            {element.observations.map((observation) => {
              const node = findAnatomyNode(observation.zoneId);
              const color = colorForPreset(observation.presetId, markerPresets);
              return (
                <li key={observation.id} className="rounded-lg bg-animeo-bg px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-bold text-animeo-dark">
                      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
                      <span className="truncate">{node?.label ?? observation.zoneId}</span>
                    </span>
                    {!readOnly ? (
                      <button
                        type="button"
                        onClick={() => removeObservation(observation.id)}
                        aria-label={`Supprimer l’observation ${node?.label ?? observation.zoneId}`}
                        className="shrink-0 text-animeo-error"
                      >
                        ×
                      </button>
                    ) : null}
                  </div>
                  {/* Le type est écrit, pas seulement couleuré. */}
                  <p className="mt-0.5 text-[10px] font-semibold" style={{ color }}>
                    {labelForPreset(observation.presetId, markerPresets)}
                  </p>
                  <input
                    aria-label={`Observation sur ${node?.label ?? observation.zoneId}`}
                    defaultValue={observation.note ?? ""}
                    disabled={readOnly}
                    placeholder="Observation…"
                    onBlur={(event) => {
                      if (event.target.value.trim() !== (observation.note ?? "")) updateNote(observation.id, event.target.value);
                    }}
                    className="mt-1 h-7 w-full rounded border border-[#d9e5e2] bg-white px-1.5 text-[11px] text-animeo-dark outline-none focus:border-animeo"
                  />
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <label className="flex items-center gap-2 text-xs font-extrabold text-animeo-dark">
        <input
          type="checkbox"
          checked={element.showLabels}
          disabled={readOnly}
          onChange={(event) => updateElement(element.id, { showLabels: event.target.checked })}
        />
        Afficher les libellés
      </label>
    </>
  );
}
