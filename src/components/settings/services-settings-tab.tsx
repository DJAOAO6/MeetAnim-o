"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { IconButton } from "@/components/ui/icon-button";
import { SectionTitle, Toggle } from "@/components/settings/settings-fields";
import { ServiceModal } from "@/components/settings/service-modal";
import type { PracticeMode } from "@/lib/practice-mode";
import type { ServiceSettings } from "@/data/settings";

type ServicesSettingsTabProps = {
  services: ServiceSettings[];
  zoneNames: string[];
  kilometricFeesEnabled: boolean;
  practiceMode: PracticeMode;
  defaultDuration: number;
  saving: boolean;
  canEdit?: boolean;
  onSave: (service: ServiceSettings) => Promise<void>;
  onToggle: (service: ServiceSettings) => void;
  onDelete: (service: ServiceSettings) => void;
};

export function ServicesSettingsTab({ services, zoneNames, kilometricFeesEnabled, practiceMode, defaultDuration, saving, canEdit = true, onSave, onToggle, onDelete }: ServicesSettingsTabProps) {
  const [modal, setModal] = useState<ServiceSettings | "new" | null>(null);
  const [deleting, setDeleting] = useState<ServiceSettings | null>(null);

  async function saveService(service: ServiceSettings) {
    await onSave(service);
    setModal(null);
  }

  return (
    <>
      <SectionTitle
        title="Prestations"
        description="Définissez les animaux concernés, les lieux proposés et vos tarifs actuels."
        action={canEdit ? <Button type="button" onClick={() => setModal("new")} icon={<Plus aria-hidden="true" className="h-4 w-4" strokeWidth={2.75} />}>Nouvelle prestation</Button> : null}
      />

      {!canEdit ? (
        <div role="status" className="mb-5 rounded-2xl border border-animeo-warning-border bg-animeo-warning-soft px-4 py-3 text-sm font-bold text-animeo-warning">Vous n’avez pas la permission de modifier les prestations. Contactez un administrateur.</div>
      ) : null}

      <fieldset disabled={!canEdit} className="disabled:opacity-60">
      <div className="grid gap-5 xl:grid-cols-2">
        {services.map((service) => (
          <Card key={service.id} className={`overflow-hidden ${service.active ? "" : "opacity-70"}`}>
            <div className={`h-1.5 ${service.active ? "bg-animeo" : "bg-animeo-subtle"}`} />
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {/* Un état qu'on allume ou éteint est un interrupteur, pas une
                        étiquette et un bouton : il agit tout de suite, comme le
                        faisait « Désactiver ». */}
                    <Toggle compact checked={service.active} onChange={() => onToggle(service)} label={service.active ? "Active" : "Inactive"} ariaLabel={`Prestation ${service.name} active`} />
                    <span className="rounded-full bg-animeo-bg px-2.5 py-1 text-xs font-black text-animeo-muted">{service.duration} min</span>
                  </div>
                  <h3 className="text-xl font-black text-animeo-dark">{service.name}</h3>
                  <p className="mt-1 text-sm text-animeo-muted">{service.description}</p>
                </div>
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-xl">🐾</div>
              </div>

              <div className="my-5 flex flex-wrap gap-2">
                {service.animals.map((animal) => <span key={animal} className="rounded-full border border-animeo-border px-3 py-1 text-xs font-extrabold text-animeo-dark">{animal}</span>)}
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <PriceBlock label="Cabinet" enabled={service.cabinetEnabled} price={service.cabinetPrice} />
                <PriceBlock label="Domicile" enabled={service.homeEnabled} price={service.homePrice} />
              </div>

              {service.homeEnabled ? (
                <div className="mt-3 flex items-center justify-between gap-4 rounded-2xl border border-animeo-border px-4 py-3 text-sm">
                  <span className="font-bold text-animeo-muted">Frais de déplacement</span>
                  <span className="text-right font-black text-animeo-dark">{travelFeeLabel(service)}</span>
                </div>
              ) : null}

              <div className="mt-4 flex items-center justify-between rounded-2xl bg-animeo-bg px-4 py-3 text-sm">
                <span className="font-bold text-animeo-muted">Rappel conseillé</span>
                <span className="font-black text-animeo-dark">{service.suggestedReminder}</span>
              </div>

              <div className="mt-5 flex items-center justify-between gap-2 border-t border-animeo-border-soft pt-4">
                <Button type="button" variant="secondary" onClick={() => setModal(service)} icon={<Pencil aria-hidden="true" className="h-4 w-4" />}>Modifier</Button>
                {/* Supprimer : corbeille à l'écart, et toujours une confirmation. */}
                <IconButton variant="danger" label={`Supprimer ${service.name}`} onClick={() => setDeleting(service)} tooltipAlign="end">
                  <Trash2 aria-hidden="true" className="h-5 w-5" />
                </IconButton>
              </div>
            </div>
          </Card>
        ))}
      </div>
      </fieldset>

      <p className="mt-5 rounded-2xl border border-animeo-border bg-animeo-soft p-4 text-sm text-animeo-dark">Les changements de tarif concernent les futures réservations. Les prix des rendez-vous historiques restent inchangés.</p>

      {deleting ? (
        <ConfirmModal
          title="Supprimer cette prestation ?"
          message={`« ${deleting.name} » ne sera plus proposée, ni sur votre page de réservation ni dans vos rendez-vous. Les rendez-vous déjà enregistrés gardent leur intitulé et leur prix.`}
          confirmLabel="Supprimer"
          onConfirm={() => { onDelete(deleting); setDeleting(null); }}
          onClose={() => setDeleting(null)}
        />
      ) : null}

      {modal ? <ServiceModal service={modal === "new" ? undefined : modal} practiceMode={practiceMode} zoneNames={zoneNames} kilometricFeesEnabled={kilometricFeesEnabled} defaultDuration={defaultDuration} saving={saving} onClose={() => setModal(null)} onSave={saveService} /> : null}
    </>
  );
}

export function ServicesSettingsShortcut() {
  return (
    <>
      <SectionTitle title="Prestations" description="La gestion des prestations et des frais de déplacement dispose maintenant de sa propre page." />
      <Card className="p-5 sm:p-7">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-black text-animeo-dark">Gérez vos prestations au même endroit</h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-animeo-muted">Durées, espèces, tarifs Cabinet et Domicile, rappels conseillés et frais de déplacement sont regroupés sur la page Prestations.</p>
          </div>
          <Link href="/dashboard/prestations" className="inline-flex shrink-0 items-center justify-center rounded-2xl bg-animeo px-5 py-3 text-sm font-extrabold text-white shadow-sm transition hover:bg-animeo-hover">Gérer mes prestations</Link>
        </div>
      </Card>
    </>
  );
}

function PriceBlock({ label, enabled, price }: { label: string; enabled: boolean; price: number }) {
  return (
    <div className={`rounded-2xl p-4 ${enabled ? "bg-animeo-soft" : "bg-animeo-surface-alt"}`}>
      <p className="text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">{label}</p>
      <div className="mt-2 flex items-end justify-between">
        <span className={`text-lg font-black ${enabled ? "text-animeo-dark" : "text-animeo-muted"}`}>{enabled ? `${price} €` : "Désactivé"}</span>
        <span className={`h-2.5 w-2.5 rounded-full ${enabled ? "bg-animeo" : "bg-animeo-subtle"}`} />
      </div>
    </div>
  );
}

function travelFeeLabel(service: ServiceSettings) {
  if (!service.travelFeesEnabled) return "Aucun frais";
  if (service.travelFeeMode === "fixed") return `${formatNumber(service.fixedTravelFee)} € fixes`;
  if (service.travelFeeMode === "zone") return "Selon la zone";
  return `${formatNumber(service.kilometricRate, 2)} €/km`;
}

function formatNumber(value: number, digits = 0) {
  return new Intl.NumberFormat("fr-FR", { minimumFractionDigits: value % 1 === 0 ? 0 : digits, maximumFractionDigits: digits }).format(value);
}
