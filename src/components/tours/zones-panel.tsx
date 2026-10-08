"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CloseButton } from "@/components/ui/close-button";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon } from "@/components/ui/icon";
import { IconButton } from "@/components/ui/icon-button";
import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import type { Tour, Zone } from "@/data/tours";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { Pencil, Plus, Trash2 } from "lucide-react";

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
  // Aucune autre zone vers laquelle réassigner : le seul chemin possible est
  // de retirer d'abord cette zone des tournées qui l'utilisent (bouton
  // "Modifier"/"Supprimer" juste au-dessus, section Tournées récurrentes) —
  // sans cet écran, le formulaire de réassignation s'affichait avec une
  // liste vide et un bouton en permanence désactivé, une impasse silencieuse.
  const [blockedDelete, setBlockedDelete] = useState<Zone | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function tourCountFor(zoneId: string): number {
    return tours.filter((tour) => tour.zoneIds.includes(zoneId)).length;
  }

  function toursUsing(zoneId: string): Tour[] {
    return tours.filter((tour) => tour.zoneIds.includes(zoneId));
  }

  function startDelete(zone: Zone) {
    const count = tourCountFor(zone.id);
    const hasReassignTarget = zones.some((candidate) => candidate.id !== zone.id);
    if (count > 0 && !hasReassignTarget) {
      setBlockedDelete(zone);
    } else if (count > 0) {
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
    <OverlayPortal>
      <div className="fixed inset-0 z-50 flex justify-end bg-animeo-deep/45 backdrop-blur-sm" role="presentation">
        <section
          ref={panelRef}
          tabIndex={-1}
          role="dialog"
          aria-modal="true"
          aria-labelledby="zones-panel-title"
          className="flex h-full w-full max-w-md flex-col bg-white shadow-[-24px_0_60px_rgb(var(--theme-shadow-rgb)/0.25)] outline-none"
        >
          <div className="flex items-center justify-between border-b border-animeo-border-soft p-5">
            <div>
              <h2 id="zones-panel-title" className="text-lg font-medium text-animeo-dark">Zones</h2>
              <p className="mt-0.5 text-xs text-animeo-muted">Villes et codes postaux — aucun rayon ni contour géographique en V1.</p>
            </div>
            <CloseButton onClick={onClose} />
          </div>

          <div className="flex-1 overflow-y-auto p-5">
            <Button type="button" variant="secondary" onClick={onNewZone} icon={<Plus aria-hidden="true" className="h-4 w-4" />} className="mb-4 w-full">Nouvelle zone</Button>

            {zones.length === 0 ? (
              <p className="text-sm text-animeo-muted">Aucune zone pour l’instant.</p>
            ) : (
              <ul className="divide-y divide-animeo-border-soft">
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
                        <div className="flex shrink-0 gap-2">
                          <Button type="button" variant="secondary" onClick={() => onEditZone(zone)} icon={<Pencil aria-hidden="true" className="h-4 w-4" />}>Modifier</Button>
                          <IconButton variant="danger" label={`Supprimer la zone ${zone.name}`} tooltip="Supprimer" onClick={() => startDelete(zone)} tooltipAlign="end">
                            <Trash2 aria-hidden="true" className="h-5 w-5" />
                          </IconButton>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5 rounded-xl border border-animeo-warning-border bg-animeo-warning-soft p-3 text-xs leading-relaxed text-animeo-warning">
              <Icon name="shield" className="mb-1 h-4 w-4" />
              {" "}Renommer une zone ou changer ses villes n’actualise pas les frais de déplacement déjà configurés pour ce nom dans Prestations — ces frais s’appliquent directement sur la page de réservation publique : pensez à les vérifier après toute modification, pour ne jamais afficher un tarif erroné à vos clients.
            </div>
          </div>
        </section>

        {reassigning ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-animeo-deep/55 p-4" role="presentation">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)]">
              <h3 className="text-base font-medium text-animeo-dark">Réassigner puis supprimer</h3>
              <p className="mt-2 text-sm text-animeo-muted">
                « {reassigning.name} » est utilisée par {tourCountFor(reassigning.id)} tournée{tourCountFor(reassigning.id) > 1 ? "s" : ""}. Choisissez la zone qui les remplacera avant de la supprimer.
              </p>
              <label className="mt-4 block">
                <span className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Réassigner vers</span>
                <select value={targetZoneId} onChange={(event) => setTargetZoneId(event.target.value)} className="h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg px-3.5 text-sm text-animeo-dark">
                  {zones.filter((zone) => zone.id !== reassigning.id).map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                </select>
              </label>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setReassigning(null)}>Annuler</Button>
                <Button type="button" variant="dangerSolid" onClick={confirmReassign} disabled={!targetZoneId || submitting}>
                  {submitting ? "Réassignation…" : "Réassigner et supprimer"}
                </Button>
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

        {blockedDelete ? (
          <div className="fixed inset-0 z-[60] flex items-center justify-center bg-animeo-deep/55 p-4" role="presentation">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)]">
              <h3 className="text-base font-medium text-animeo-dark">Impossible de supprimer « {blockedDelete.name} »</h3>
              <p className="mt-2 text-sm text-animeo-muted">
                C’est la seule zone existante, et elle est utilisée par {toursUsing(blockedDelete.id).length > 1 ? "ces tournées" : "cette tournée"} :
              </p>
              <ul className="mt-2 space-y-1">
                {toursUsing(blockedDelete.id).map((tour) => (
                  <li key={tour.id} className="rounded-lg bg-animeo-bg px-3 py-2 text-sm font-medium text-animeo-dark">{tour.name}</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-animeo-muted">
                Supprimez ou modifiez d’abord {toursUsing(blockedDelete.id).length > 1 ? "ces tournées" : "cette tournée"} (section « Tournées récurrentes »), ou créez une autre zone pour pouvoir réassigner celle-ci.
              </p>
              <div className="mt-5 flex justify-end">
                <Button type="button" onClick={() => setBlockedDelete(null)}>Compris</Button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </OverlayPortal>
  );
}
