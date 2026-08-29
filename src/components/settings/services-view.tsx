"use client";

import { useState } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { PageHeader } from "@/components/layout/page-header";
import { ServicesSettingsTab } from "@/components/settings/services-settings-tab";
import { Toggle } from "@/components/settings/settings-fields";
import { Card } from "@/components/ui/card";
import { initialSettings, type ServiceSettings } from "@/data/settings";
import { hasPermission } from "@/lib/auth/permissions";
import { deleteServiceAction, saveServiceAction } from "@/lib/services-actions";
import { notify } from "@/lib/notify";

type ServicesViewProps = {
  initialServices: ServiceSettings[];
};

// Le calcul kilométrique reste une préférence d'affichage locale (pas encore
// persistée en base) : elle ne détermine que quelles options sont proposées
// dans le formulaire d'une prestation, jamais les prix enregistrés.
let sessionKilometricFeesEnabled = initialSettings.kilometricFeesEnabled;

export function ServicesView({ initialServices }: ServicesViewProps) {
  const currentUser = useCurrentUser();
  const canManagePublicSettings = hasPermission(currentUser, "MANAGE_PUBLIC_SETTINGS");
  const [services, setServices] = useState<ServiceSettings[]>(initialServices);
  const [kilometricFeesEnabled, setKilometricFeesEnabled] = useState(() => sessionKilometricFeesEnabled);
  const [saving, setSaving] = useState(false);

  async function saveService(service: ServiceSettings) {
    const isNew = !service.id;
    setSaving(true);
    const result = await saveServiceAction(service);
    setSaving(false);

    if (!result.ok) {
      notify.error(result.error);
      return;
    }

    setServices((current) => {
      const exists = current.some((item) => item.id === result.service.id);
      return exists ? current.map((item) => (item.id === result.service.id ? result.service : item)) : [result.service, ...current];
    });
    notify.success(isNew ? "Prestation créée" : "Prestation modifiée");
  }

  async function toggleService(service: ServiceSettings) {
    const result = await saveServiceAction({ ...service, active: !service.active });
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setServices((current) => current.map((item) => (item.id === result.service.id ? result.service : item)));
    notify.success(service.active ? "Prestation désactivée" : "Prestation activée");
  }

  async function removeService(service: ServiceSettings) {
    const result = await deleteServiceAction(service.id);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setServices((current) => current.filter((item) => item.id !== service.id));
    notify.success("Prestation supprimée");
  }

  function updateKilometricFeesEnabled(value: boolean) {
    sessionKilometricFeesEnabled = value;
    setKilometricFeesEnabled(value);
    notify.success(value ? "Frais kilométriques activés" : "Frais kilométriques désactivés");
  }

  const activeServices = services.filter((service) => service.active).length;
  const cabinetServices = services.filter((service) => service.active && service.cabinetEnabled).length;
  const homeServices = services.filter((service) => service.active && service.homeEnabled).length;

  return (
    <>
      <PageHeader
        title="Prestations"
        description="Configurez vos prestations, vos tarifs et les frais de déplacement appliqués aux consultations à domicile."
      />

      <section aria-label="Résumé des prestations" className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Prestations" value={services.length} detail="au total" />
        <SummaryCard label="Actives" value={activeServices} detail="visibles à la réservation" />
        <SummaryCard label="Au cabinet" value={cabinetServices} detail="prestations actives" />
        <SummaryCard label="À domicile" value={homeServices} detail="prestations actives" accent />
      </section>

      <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h3 className="text-base font-black text-animeo-dark">Frais kilométriques</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-animeo-muted">Option avancée : facturer le déplacement au kilomètre plutôt qu’un montant fixe ou par zone. Désactivée par défaut ; une fois activée, elle devient disponible comme mode de calcul dans chaque prestation.</p>
        </div>
        <Toggle checked={kilometricFeesEnabled} onChange={updateKilometricFeesEnabled} label={kilometricFeesEnabled ? "Activés" : "Désactivés"} disabled={!canManagePublicSettings} />
      </Card>

      <ServicesSettingsTab services={services} kilometricFeesEnabled={kilometricFeesEnabled} saving={saving} canEdit={canManagePublicSettings} onSave={saveService} onToggle={toggleService} onDelete={removeService} />

      <p className="mt-5 rounded-2xl border border-[#d5e6e2] bg-white p-4 text-sm leading-6 text-animeo-muted">
        Ces prestations sont enregistrées et apparaissent immédiatement sur votre page publique de réservation.
      </p>
    </>
  );
}

function SummaryCard({ label, value, detail, accent = false }: { label: string; value: number; detail: string; accent?: boolean }) {
  return (
    <Card className="p-5">
      <p className="text-sm font-bold text-animeo-muted">{label}</p>
      <p className={`mt-2 text-3xl font-black ${accent ? "text-animeo-accent" : "text-animeo"}`}>{value}</p>
      <p className="mt-1 text-xs text-animeo-muted">{detail}</p>
    </Card>
  );
}
