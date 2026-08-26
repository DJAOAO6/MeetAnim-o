"use client";

import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { ServicesSettingsTab } from "@/components/settings/services-settings-tab";
import { Toggle } from "@/components/settings/settings-fields";
import { Card } from "@/components/ui/card";
import { initialSettings, type ServiceSettings } from "@/data/settings";

function cloneServices(services: ServiceSettings[]) {
  return services.map((service) => ({
    ...service,
    animals: [...service.animals],
    zoneFees: { ...service.zoneFees },
  }));
}

let sessionServices = cloneServices(initialSettings.services);
let sessionKilometricFeesEnabled = initialSettings.kilometricFeesEnabled;

export function ServicesView() {
  const [services, setServices] = useState<ServiceSettings[]>(() => sessionServices);
  const [kilometricFeesEnabled, setKilometricFeesEnabled] = useState(() => sessionKilometricFeesEnabled);
  const [feedback, setFeedback] = useState<string | null>(null);

  function updateServices(nextServices: ServiceSettings[], message: string) {
    sessionServices = nextServices;
    setServices(nextServices);
    setFeedback(message);
  }

  function updateKilometricFeesEnabled(value: boolean) {
    sessionKilometricFeesEnabled = value;
    setKilometricFeesEnabled(value);
    setFeedback(value ? "Frais kilométriques activés" : "Frais kilométriques désactivés");
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

      {feedback ? (
        <div role="status" className="mb-5 flex items-center justify-between gap-4 rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark">
          <span>✓ {feedback}</span>
          <button type="button" onClick={() => setFeedback(null)} aria-label="Fermer la notification" className="text-xl leading-none">×</button>
        </div>
      ) : null}

      <Card className="mb-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div>
          <h3 className="text-base font-black text-animeo-dark">Frais kilométriques</h3>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-animeo-muted">Option avancée : facturer le déplacement au kilomètre plutôt qu’un montant fixe ou par zone. Désactivée par défaut ; une fois activée, elle devient disponible comme mode de calcul dans chaque prestation.</p>
        </div>
        <Toggle checked={kilometricFeesEnabled} onChange={updateKilometricFeesEnabled} label={kilometricFeesEnabled ? "Activés" : "Désactivés"} />
      </Card>

      <ServicesSettingsTab services={services} kilometricFeesEnabled={kilometricFeesEnabled} onChange={updateServices} />

      <p className="mt-5 rounded-2xl border border-[#d5e6e2] bg-white p-4 text-sm leading-6 text-animeo-muted">
        Données locales uniquement : aucune prestation, distance ou modification n’est envoyée à un service externe.
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
