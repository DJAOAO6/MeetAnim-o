"use client";

import { useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import type { Tour, Zone } from "@/data/tours";

type ZonesPanelProps = {
  zones: Zone[];
  tours: Tour[];
  onClose: () => void;
  onNewZone: () => void;
  onEditZone: (zone: Zone) => void;
  onDeleteZone: (zone: Zone) => void;
  onReassignAndDelete: (zoneId: string, targetZoneId: string) => Promise<void>;
};

/**
 * Panneau latéral (pas de composant "Sheet" existant dans l'app — construit
 * ici en réutilisant le même socle que les modales centrées : piège de
 * focus, Échap, superposition assombrie).
 */
export function ZonesPanel({ zones, tours, onClose, onNewZone, onEditZone, onDeleteZone, onReassignAndDelete }: ZonesPanelProps) {
  const panelRef = useModalFocusTrap<HTMLElement>(onClose);
  const [reassigning, setReassigning] = useState<Zone | null>(null);
  const [targetZoneId, setTargetZoneId] = useState("");
  const [simpleDeleteTarget, setSimpleDeleteTarget] = useState<Zone | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function tourCountFor(zoneId: string): number {
    return tours.filter((tour) => tour.zoneIds.includes(zoneId)).length;
  }

  function startDelete(zone: Zone) {
    const count = tourCountFor(zone.id);
    if (count > 0) {
      setReassigning(zone);
      setTargetZoneId(zones.find((candidate) => candidate.id !== zone.id)?.id ?? "");
    } else {
      setSimpleDeleteTarget(zone);
    }
  }

  async function confirmReassign() {
    if (!reassigning || !targetZoneId) return;
    setSubmitting(true);
    await onReassignAndDelete(reassigning.id, targetZoneId);
    setSubmitting(false);
    setReassigning(null);
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-[#102f37]/45 backdrop-blur-sm" role="presentation">
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="zones-panel-title"
        className="flex h-full w-full max-w-md flex-col bg-white shadow-[-24px_0_60px_rgba(12,39,47,0.25)] outline-none"
      >
        <div className="flex items-center justify-between border-b border-[#e5eeeb] p-5">
          <div>
            <h2 id="zones-panel-title" className="text-lg font-medium text-animeo-dark">Zones</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">Villes et codes postaux — aucun rayon ni contour géographique en V1.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 items-center justify-center rounded-xl text-animeo-muted hover:bg-animeo-bg">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <button type="button" onClick={onNewZone} className="mb-4 w-full rounded-xl border border-animeo px-4 py-2.5 text-sm font-medium text-animeo transition hover:bg-animeo-soft">+ Nouvelle zone</button>

          {zones.length === 0 ? (
            <p className="text-sm text-animeo-muted">Aucune zone pour l’instant.</p>
          ) : (
            <ul className="divide-y divide-[#edf2f0]">
              {zones.map((zone) => {
                const count = tourCountFor(zone.id);
                return (
                  <li key={zone.id} className="py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-animeo-dark">{zone.name}</p>
                        <p className="mt-0.5 text-xs text-animeo-muted">
                          {zone.cities.length} ville{zone.cities.length > 1 ? "s" : ""} · {count} tournée{count > 1 ? "s" : ""}
                        </p>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button type="button" onClick={() => onEditZone(zone)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-animeo-dark hover:bg-animeo-bg">Modifier</button>
                        <button type="button" onClick={() => startDelete(zone)} className="rounded-lg px-2.5 py-1.5 text-xs font-medium text-[#a9573b] hover:bg-[#fff1ec]">Supprimer</button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-5 rounded-xl border border-[#f1d89f] bg-[#fff9ec] p-3 text-xs leading-relaxed text-[#8c6118]">
            <Icon name="shield" className="mb-1 h-4 w-4" />
            {" "}Renommer une zone n’actualise pas les frais de déplacement déjà configurés pour ce nom dans Prestations — pensez à les vérifier après un renommage.
          </div>
        </div>
      </section>

      {reassigning ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#102f37]/55 p-4" role="presentation">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgba(12,39,47,0.3)]">
            <h3 className="text-base font-medium text-animeo-dark">Réassigner puis supprimer</h3>
            <p className="mt-2 text-sm text-animeo-muted">
              « {reassigning.name} » est utilisée par {tourCountFor(reassigning.id)} tournée{tourCountFor(reassigning.id) > 1 ? "s" : ""}. Choisissez la zone qui les remplacera avant de la supprimer.
            </p>
            <label className="mt-4 block">
              <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Réassigner vers</span>
              <select value={targetZoneId} onChange={(event) => setTargetZoneId(event.target.value)} className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm text-animeo-dark">
                {zones.filter((zone) => zone.id !== reassigning.id).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
              </select>
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button type="button" onClick={() => setReassigning(null)} className="rounded-xl border border-[#d4e2df] px-4 py-2 text-sm font-medium text-animeo-dark hover:bg-animeo-bg">Annuler</button>
              <button type="button" onClick={confirmReassign} disabled={!targetZoneId || submitting} className="rounded-xl bg-animeo px-4 py-2 text-sm font-medium text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-60">
                {submitting ? "Réassignation…" : "Réassigner et supprimer"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {simpleDeleteTarget ? (
        <ConfirmModal
          title="Supprimer cette zone ?"
          message={`« ${simpleDeleteTarget.name} » sera définitivement supprimée. Aucune tournée ne l'utilise actuellement.`}
          confirmLabel="Supprimer"
          onConfirm={() => { onDeleteZone(simpleDeleteTarget); setSimpleDeleteTarget(null); }}
          onClose={() => setSimpleDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
