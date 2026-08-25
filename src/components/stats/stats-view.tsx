"use client";

import { useMemo, useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { PageHeader } from "@/components/layout/page-header";
import {
  DonutChart,
  MetricStrip,
  RevenueChart,
  SimpleBarChart,
  StatMetric,
  StatSection,
  StatsFilters,
} from "@/components/stats/stats-ui";
import {
  periodOptions,
  serviceOptions,
  speciesOptions,
  statsMockData,
  type BreedSpecies,
  type StatsPeriod,
  type StatsService,
  type StatsSpecies,
} from "@/data/stats-mock-data";
import { resolveSpeciesColor, type AnimalSpecies } from "@/data/species";

const currencyFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const breedTabs: Array<{ value: BreedSpecies; label: string }> = [
  { value: "dog", label: "Chien" },
  { value: "cat", label: "Chat" },
  { value: "horse", label: "Cheval" },
  { value: "nac", label: "NAC" },
];

export function StatsView() {
  const { theme } = useDashboardTheme();
  const [period, setPeriod] = useState<StatsPeriod>("current");
  const [service, setService] = useState<StatsService>("all");
  const [species, setSpecies] = useState<StatsSpecies>("all");
  const [breedSpecies, setBreedSpecies] = useState<BreedSpecies>("dog");
  const [startDate, setStartDate] = useState("2026-08-01");
  const [endDate, setEndDate] = useState("2026-08-31");

  const periodFactor = useMemo(() => {
    if (period !== "custom") return periodOptions.find((option) => option.value === period)?.factor ?? 1;
    const start = new Date(startDate).getTime();
    const end = new Date(endDate).getTime();
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 1;
    const days = Math.floor((end - start) / 86_400_000) + 1;
    return Math.min(12, Math.max(0.25, days / 30.4));
  }, [endDate, period, startDate]);

  const serviceFactor = serviceOptions.find((option) => option.value === service)?.factor ?? 1;
  const speciesFactor = speciesOptions.find((option) => option.value === species)?.factor ?? 1;
  const totalFactor = periodFactor * serviceFactor * speciesFactor;
  const seriesFactor = Math.min(1.2, Math.max(0.45, periodFactor)) * serviceFactor * speciesFactor;
  const activePeriodLabel = periodOptions.find((option) => option.value === period)?.label ?? "Période";

  function scaledCount(value: number) {
    return Math.max(value > 0 ? 1 : 0, Math.round(value * totalFactor));
  }

  function scaledMoney(value: number) {
    return Math.max(0, Math.round((value * totalFactor) / 10) * 10);
  }

  const revenueSeries = statsMockData.revenueSeries.map((item) => ({ ...item, value: Math.round((item.value * seriesFactor) / 10) * 10 }));
  const visibleServices = service === "all" ? statsMockData.services : statsMockData.services.filter((_, index) => ["canine", "equine", "massage", "nac"][index] === service);
  const breedData = statsMockData.breeds[breedSpecies];

  return (
    <>
      <PageHeader title="Statistiques" description="Analysez votre activité et suivez son évolution." />

      <StatsFilters
        period={period}
        service={service}
        species={species}
        startDate={startDate}
        endDate={endDate}
        onPeriodChange={setPeriod}
        onServiceChange={setService}
        onSpeciesChange={(value) => {
          setSpecies(value);
          if (value !== "all") setBreedSpecies(value);
        }}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
      />

      <MetricStrip>
        <StatMetric label="Chiffre d’affaires" value={currencyFormatter.format(scaledMoney(statsMockData.overview.revenue))} detail={`+${statsMockData.overview.revenueVariation} % vs période précédente`} icon="euro" positive />
        <StatMetric label="Consultations" value={numberFormatter.format(scaledCount(statsMockData.overview.consultations))} detail={activePeriodLabel} icon="calendar" />
        <StatMetric label="Panier moyen" value={currencyFormatter.format(statsMockData.overview.averageBasket)} detail="Par consultation" icon="services" />
        <StatMetric label="Nouveaux clients" value={numberFormatter.format(scaledCount(statsMockData.overview.newClients))} detail="Sur la période" icon="clients" />
        <StatMetric label="Kilomètres parcourus" value={`${numberFormatter.format(scaledCount(statsMockData.overview.kilometers))} km`} detail="Déplacements professionnels" icon="map" />
      </MetricStrip>

      <StatSection
        title="Évolution du chiffre d’affaires"
        description="Évolution mensuelle des consultations encaissées. Données locales fictives."
        action={<div className="text-right"><p className="text-xs font-bold text-animeo-muted">Total sélectionné</p><p className="text-xl font-black text-animeo-dark">{currencyFormatter.format(scaledMoney(statsMockData.overview.revenue))}</p></div>}
        className="mb-6"
      >
        <RevenueChart data={revenueSeries} />
      </StatSection>

      <div className="grid gap-6 xl:grid-cols-2">
        <StatSection title="Mode de consultation" description="Répartition de l’activité entre domicile et cabinet.">
          <div className="mb-6 flex h-3 overflow-hidden rounded-full bg-animeo-bg" aria-label="62 % domicile et 38 % cabinet">
            {statsMockData.consultationModes.map((mode) => <span key={mode.label} style={{ width: `${mode.share}%`, backgroundColor: mode.color }} />)}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {statsMockData.consultationModes.map((mode) => (
              <div key={mode.label} className="rounded-[14px] border border-[var(--theme-border)] p-4">
                <div className="flex items-center justify-between"><h3 className="font-extrabold text-animeo-dark">{mode.label}</h3><span className="text-sm font-black text-animeo">{mode.share} %</span></div>
                <p className="mt-2 text-2xl font-black text-animeo-dark">{scaledCount(mode.consultations)}</p>
                <p className="text-xs text-animeo-muted">consultations</p>
                <dl className="mt-4 space-y-2 border-t border-[var(--theme-border)] pt-3 text-sm">
                  <DataLine label={`CA ${mode.label.toLowerCase()}`} value={currencyFormatter.format(scaledMoney(mode.revenue))} />
                  <DataLine label="Panier moyen" value={currencyFormatter.format(mode.averageBasket)} />
                </dl>
              </div>
            ))}
          </div>
        </StatSection>

        <StatSection title="CA par prestation" description="Montant et volume de consultations par type de prestation.">
          <div className="space-y-5">
            {visibleServices.map((item) => {
              const revenue = scaledMoney(item.revenue / (service === "all" ? 1 : serviceFactor));
              const consultationCount = scaledCount(item.consultations / (service === "all" ? 1 : serviceFactor));
              return (
                <div key={item.label}>
                  <div className="mb-2 flex items-end justify-between gap-4">
                    <div><p className="font-extrabold text-animeo-dark">{item.label}</p><p className="text-xs text-animeo-muted">{consultationCount} consultation{consultationCount > 1 ? "s" : ""}</p></div>
                    <strong className="text-animeo-dark">{currencyFormatter.format(revenue)}</strong>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-animeo-bg"><div className="h-full rounded-full bg-animeo" style={{ width: `${Math.max(4, (item.revenue / 1150) * 100)}%` }} /></div>
                </div>
              );
            })}
          </div>
        </StatSection>

        <StatSection title="Répartition des animaux" description="Part de chaque espèce dans les animaux suivis.">
          <DonutChart items={statsMockData.species.map((item) => ({ ...item, color: resolveSpeciesColor(theme.speciesColors, item.label as AnimalSpecies) }))} centerLabel="Animaux suivis" />
        </StatSection>

        <div className="grid gap-6 sm:grid-cols-2">
          <StatSection title="Sexe" description="La catégorie non renseignée reste comptabilisée.">
            <SimpleBarChart items={statsMockData.sex} />
          </StatSection>
          <StatSection title="Stérilisation" description="Informations connues dans les fiches animaux.">
            <SimpleBarChart items={statsMockData.sterilization} />
          </StatSection>
        </div>

        <StatSection title="Âge des animaux suivis" description="Répartition par tranche d’âge, données inconnues incluses.">
          <SimpleBarChart items={statsMockData.ages} />
        </StatSection>

        <StatSection
          title="Races les plus suivies"
          description={`${breedData.total} ${breedData.unit} suivis · ${breedData.distinct} races différentes`}
          action={<div className="flex flex-wrap gap-1 rounded-[12px] bg-animeo-bg p-1">{breedTabs.map((tab) => <button key={tab.value} type="button" onClick={() => setBreedSpecies(tab.value)} aria-pressed={breedSpecies === tab.value} className={`rounded-[9px] px-2.5 py-1.5 text-xs font-extrabold transition ${breedSpecies === tab.value ? "bg-animeo text-white" : "text-animeo-muted hover:text-animeo-dark"}`}>{tab.label}</button>)}</div>}
        >
          <SimpleBarChart items={breedData.items} formatter={(value) => numberFormatter.format(value)} />
        </StatSection>

        <div className="grid gap-6 sm:grid-cols-2">
          <StatSection title="Zones douloureuses" description="Localisations les plus fréquemment identifiées en consultation.">
            <SimpleBarChart items={statsMockData.painAreas} formatter={(value) => `${value} %`} />
          </StatSection>
          <StatSection title="Pathologies / motifs récurrents" description="Motifs de consultation les plus courants.">
            <SimpleBarChart items={statsMockData.pathologies} formatter={(value) => `${value} %`} />
          </StatSection>
        </div>

        <StatSection title="Fidélité clients" description="Les délais sont calculés sur les animaux ayant plusieurs consultations.">
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactValue label="Nouveaux clients" value={numberFormatter.format(scaledCount(statsMockData.loyalty.newClients))} />
            <CompactValue label="Clients déjà connus" value={numberFormatter.format(scaledCount(statsMockData.loyalty.returningClients))} />
            <CompactValue label="Taux de retour" value={`${statsMockData.loyalty.returnRate} %`} accent />
            <CompactValue label="Délai moyen entre deux consultations" value={`${statsMockData.loyalty.averageDelayMonths.toLocaleString("fr-FR")} mois`} />
          </div>
        </StatSection>

        <StatSection title="Satisfaction client" description="Avis et recommandations collectés après consultation.">
          <div className="grid gap-3 sm:grid-cols-3">
            <CompactValue label="Note moyenne" value={`${statsMockData.satisfaction.averageRating.toLocaleString("fr-FR")} / 5`} accent />
            <CompactValue label="Avis collectés" value={numberFormatter.format(scaledCount(statsMockData.satisfaction.reviewsCount))} />
            <CompactValue label="Taux de recommandation" value={`${statsMockData.satisfaction.recommendationRate} %`} />
          </div>
        </StatSection>

        <StatSection title="Annulations & no-show" description="Fiabilité des rendez-vous réservés sur la période.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CompactValue label="RDV réservés" value={numberFormatter.format(scaledCount(statsMockData.cancellations.totalBooked))} />
            <CompactValue label="RDV honorés" value={numberFormatter.format(scaledCount(statsMockData.cancellations.honored))} />
            <CompactValue label="Annulés" value={numberFormatter.format(scaledCount(statsMockData.cancellations.cancelled))} />
            <CompactValue label="Absences (no-show)" value={numberFormatter.format(scaledCount(statsMockData.cancellations.noShow))} />
            <CompactValue label="Taux d’annulation" value={`${statsMockData.cancellations.cancellationRate} %`} />
            <CompactValue label="Taux de no-show" value={`${statsMockData.cancellations.noShowRate} %`} />
          </div>
        </StatSection>

        <StatSection title="Performance des rappels" description="Rendez-vous repris après l’envoi d’un rappel client.">
          <div className="grid gap-3 sm:grid-cols-2">
            <CompactValue label="Rappels envoyés" value={numberFormatter.format(scaledCount(statsMockData.reminders.sent))} />
            <CompactValue label="Rendez-vous repris" value={numberFormatter.format(scaledCount(statsMockData.reminders.bookedAgain))} />
            <CompactValue label="Taux de reprise" value={`${statsMockData.reminders.returnRate} %`} accent />
            <CompactValue label="CA généré après rappel" value={currencyFormatter.format(scaledMoney(statsMockData.reminders.generatedRevenue))} />
          </div>
        </StatSection>

        <StatSection title="Activité par zone" description="Classement selon le chiffre d’affaires réalisé.">
          <div className="space-y-5">
            {statsMockData.zones.map((zone, index) => (
              <div key={zone.label}>
                <div className="mb-2 flex items-start justify-between gap-4">
                  <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-animeo-soft text-xs font-black text-animeo-dark">{index + 1}</span><div><p className="font-extrabold text-animeo-dark">{zone.label}</p><p className="text-xs text-animeo-muted">{scaledCount(zone.consultations)} consultations · {scaledCount(zone.clients)} clients</p></div></div>
                  <strong className="text-sm text-animeo-dark">{currencyFormatter.format(scaledMoney(zone.revenue))}</strong>
                </div>
                <div className="ml-10 h-1.5 overflow-hidden rounded-full bg-animeo-bg"><div className="h-full rounded-full bg-animeo" style={{ width: `${(zone.revenue / statsMockData.zones[0].revenue) * 100}%` }} /></div>
              </div>
            ))}
          </div>
        </StatSection>

        <StatSection title="Déplacements" description="Performance des consultations réalisées à domicile.">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <CompactValue label="Kilomètres parcourus" value={`${numberFormatter.format(scaledCount(statsMockData.travel.kilometers))} km`} />
            <CompactValue label="Consultations à domicile" value={numberFormatter.format(scaledCount(statsMockData.travel.homeConsultations))} />
            <CompactValue label="Kilomètres moyens / consultation" value={`${statsMockData.travel.averageKilometers.toLocaleString("fr-FR")} km`} />
            <CompactValue label="Frais de déplacement facturés" value={currencyFormatter.format(scaledMoney(statsMockData.travel.travelFees))} />
            <CompactValue label="CA total domicile" value={currencyFormatter.format(scaledMoney(statsMockData.travel.homeRevenue))} accent />
            <CompactValue label="CA moyen / consultation domicile" value={currencyFormatter.format(statsMockData.travel.averageHomeRevenue)} />
          </div>
          <p className="mt-4 border-t border-[var(--theme-border)] pt-3 text-xs text-animeo-muted">Indicateur avancé · {statsMockData.travel.revenuePerKilometer.toLocaleString("fr-FR", { minimumFractionDigits: 2 })} € de chiffre d’affaires généré par kilomètre parcouru.</p>
        </StatSection>
      </div>

      <StatSection title="Performance des tournées" description="Comparez les tournées selon leur distance et leur rentabilité." className="mt-6">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-sm">
            <thead className="border-y border-[var(--theme-border)] bg-animeo-bg text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">
              <tr><th className="px-4 py-3">Tournée</th><th className="px-4 py-3">RDV</th><th className="px-4 py-3">Kilomètres</th><th className="px-4 py-3">CA</th><th className="px-4 py-3 text-right">CA moyen / RDV</th></tr>
            </thead>
            <tbody className="divide-y divide-[var(--theme-border)]">
              {statsMockData.tours.map((tour) => <tr key={tour.label}><td className="px-4 py-4 font-extrabold text-animeo-dark">{tour.label}</td><td className="px-4 py-4 font-bold text-animeo-muted">{scaledCount(tour.appointments)}</td><td className="px-4 py-4 font-bold text-animeo-muted">{scaledCount(tour.kilometers)} km</td><td className="px-4 py-4 font-extrabold text-animeo-dark">{currencyFormatter.format(scaledMoney(tour.revenue))}</td><td className="px-4 py-4 text-right font-extrabold text-animeo">{currencyFormatter.format(tour.averageRevenue)} / RDV</td></tr>)}
            </tbody>
          </table>
        </div>
      </StatSection>

      <p className="py-6 text-center text-xs text-animeo-muted">Données locales fictives à des fins de démonstration · aucune donnée médicale analysée.</p>
    </>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="font-extrabold text-animeo-dark">{value}</dd></div>;
}

function CompactValue({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-[14px] border border-[var(--theme-border)] bg-animeo-bg p-4"><p className="text-xs font-bold leading-5 text-animeo-muted">{label}</p><p className={`mt-1 text-xl font-black ${accent ? "text-animeo" : "text-animeo-dark"}`}>{value}</p></div>;
}
