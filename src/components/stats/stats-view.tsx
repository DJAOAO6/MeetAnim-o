"use client";

import { useState, useTransition } from "react";
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
import { getStatsAction } from "@/lib/stats-actions";
import type { StatsData, StatsFilters as StatsFiltersValue, StatsPeriod } from "@/data/stats";
import { resolveSpeciesColor, type AnimalSpecies } from "@/data/species";

type BreedSpecies = AnimalSpecies;

const currencyFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const breedTabs: Array<{ value: BreedSpecies; label: string }> = [
  { value: "Chien", label: "Chien" },
  { value: "Chat", label: "Chat" },
  { value: "Cheval", label: "Cheval" },
  { value: "NAC", label: "NAC" },
  { value: "Petit ruminant", label: "Petit ruminant" },
];

function isValidDateInput(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

type StatsViewProps = {
  initialStats: StatsData;
  initialFilters: StatsFiltersValue;
  serviceOptions: Array<{ id: string; name: string }>;
};

export function StatsView({ initialStats, initialFilters, serviceOptions }: StatsViewProps) {
  const { theme } = useDashboardTheme();
  const [filters, setFilters] = useState(initialFilters);
  const [stats, setStats] = useState(initialStats);
  const [breedSpecies, setBreedSpecies] = useState<BreedSpecies>("Chien");
  const [isPending, startTransition] = useTransition();

  function applyFilters(next: StatsFiltersValue) {
    setFilters(next);
    if (next.period === "custom" && (!isValidDateInput(next.startDate) || !isValidDateInput(next.endDate))) return;
    startTransition(async () => {
      const result = await getStatsAction(next);
      if (result) setStats(result);
    });
  }

  const activePeriodLabel = { current: "Ce mois-ci", previous: "Mois dernier", "3months": "3 derniers mois", "6months": "6 derniers mois", year: "Cette année", previousYear: "Année dernière", custom: "Période choisie" }[filters.period];
  const breedData = stats.breeds[breedSpecies];

  return (
    <>
      <PageHeader title="Statistiques" description="Analysez votre activité et suivez son évolution." />

      <StatsFilters
        period={filters.period}
        serviceId={filters.serviceId}
        species={filters.species}
        startDate={filters.startDate}
        endDate={filters.endDate}
        serviceOptions={serviceOptions}
        onPeriodChange={(value: StatsPeriod) => applyFilters({ ...filters, period: value })}
        onServiceChange={(value) => applyFilters({ ...filters, serviceId: value })}
        onSpeciesChange={(value) => {
          applyFilters({ ...filters, species: value });
          if (value !== "all") setBreedSpecies(value);
        }}
        onStartDateChange={(value) => applyFilters({ ...filters, startDate: value })}
        onEndDateChange={(value) => applyFilters({ ...filters, endDate: value })}
      />

      <div className={isPending ? "opacity-60 transition-opacity" : "transition-opacity"}>
        <MetricStrip>
          <StatMetric
            label="Chiffre d’affaires"
            value={currencyFormatter.format(stats.overview.revenue)}
            detail={stats.overview.revenueVariationPct != null ? `${stats.overview.revenueVariationPct >= 0 ? "+" : ""}${stats.overview.revenueVariationPct} % vs période précédente` : "Pas de donnée sur la période précédente"}
            icon="euro"
            positive={stats.overview.revenueVariationPct != null && stats.overview.revenueVariationPct >= 0}
          />
          <StatMetric label="Consultations" value={numberFormatter.format(stats.overview.consultations)} detail={activePeriodLabel} icon="calendar" />
          <StatMetric label="Nouveaux clients" value={numberFormatter.format(stats.overview.newClients)} detail="Sur la période" icon="clients" />
          <StatMetric label="Consultations à domicile" value={numberFormatter.format(stats.overview.homeConsultations)} detail="Sur la période" icon="map" />
        </MetricStrip>

        <StatSection
          title="Évolution du chiffre d’affaires"
          description="Chiffre d’affaires mensuel des consultations tenues (statut Terminé), 8 derniers mois."
          action={<div className="text-right"><p className="text-xs font-bold text-animeo-muted">Total sélectionné</p><p className="text-xl font-black text-animeo-dark">{currencyFormatter.format(stats.overview.revenue)}</p></div>}
          className="mb-6"
        >
          <RevenueChart data={stats.revenueSeries} />
        </StatSection>

        <div className="grid gap-6 xl:grid-cols-2">
          <StatSection title="Mode de consultation" description="Répartition de l’activité entre domicile et cabinet.">
            <div className="mb-6 flex h-3 overflow-hidden rounded-full bg-animeo-bg" aria-label={stats.consultationModes.map((m) => `${m.share} % ${m.label.toLowerCase()}`).join(" et ")}>
              {stats.consultationModes.map((mode) => <span key={mode.label} style={{ width: `${mode.share}%`, backgroundColor: mode.label === "Domicile" ? "var(--theme-primary)" : "var(--theme-heading)" }} />)}
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {stats.consultationModes.map((mode) => (
                <div key={mode.label} className="rounded-[14px] border border-[var(--theme-border)] p-4">
                  <div className="flex items-center justify-between"><h3 className="font-extrabold text-animeo-dark">{mode.label}</h3><span className="text-sm font-black text-animeo">{mode.share} %</span></div>
                  <p className="mt-2 text-2xl font-black text-animeo-dark">{mode.consultations}</p>
                  <p className="text-xs text-animeo-muted">consultations</p>
                  <dl className="mt-4 space-y-2 border-t border-[var(--theme-border)] pt-3 text-sm">
                    <DataLine label={`CA ${mode.label.toLowerCase()}`} value={currencyFormatter.format(mode.revenue)} />
                  </dl>
                </div>
              ))}
            </div>
          </StatSection>

          <StatSection title="CA par prestation" description="Montant et volume de consultations par type de prestation.">
            {stats.services.length === 0 ? <EmptyState /> : (
              <div className="space-y-5">
                {stats.services.map((item) => (
                  <div key={item.label}>
                    <div className="mb-2 flex items-end justify-between gap-4">
                      <div><p className="font-extrabold text-animeo-dark">{item.label}</p><p className="text-xs text-animeo-muted">{item.consultations} consultation{item.consultations > 1 ? "s" : ""}</p></div>
                      <strong className="text-animeo-dark">{currencyFormatter.format(item.revenue)}</strong>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-animeo-bg"><div className="h-full rounded-full bg-animeo" style={{ width: `${Math.max(4, (item.revenue / (stats.services[0]?.revenue || 1)) * 100)}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </StatSection>

          <StatSection title="Répartition des animaux" description="Part de chaque espèce parmi les animaux vus sur la période.">
            {stats.species.length === 0 ? <EmptyState /> : (
              <DonutChart items={stats.species.map((item) => ({ ...item, color: resolveSpeciesColor(theme.speciesColors, item.label as AnimalSpecies) }))} centerLabel="Animaux vus" />
            )}
          </StatSection>

          <div className="grid gap-6 sm:grid-cols-2">
            <StatSection title="Sexe" description="La catégorie non renseignée reste comptabilisée.">
              {stats.sex.length === 0 ? <EmptyState /> : <SimpleBarChart items={stats.sex} />}
            </StatSection>
            <StatSection title="Âge des animaux" description="Répartition par tranche d’âge, données inconnues incluses.">
              {stats.ages.length === 0 ? <EmptyState /> : <SimpleBarChart items={stats.ages} />}
            </StatSection>
          </div>

          <StatSection
            title="Races les plus suivies"
            description={breedData ? `${breedData.total} ${breedTabs.find((t) => t.value === breedSpecies)?.label.toLowerCase()}(s) suivis · ${breedData.distinct} races différentes` : "Aucun animal de cette espèce sur la période."}
            action={<div className="flex flex-wrap gap-1 rounded-[12px] bg-animeo-bg p-1">{breedTabs.map((tab) => <button key={tab.value} type="button" onClick={() => setBreedSpecies(tab.value)} aria-pressed={breedSpecies === tab.value} className={`rounded-[9px] px-2.5 py-1.5 text-xs font-extrabold transition ${breedSpecies === tab.value ? "bg-animeo text-white" : "text-animeo-muted hover:text-animeo-dark"}`}>{tab.label}</button>)}</div>}
          >
            {!breedData || breedData.items.length === 0 ? <EmptyState /> : <SimpleBarChart items={breedData.items} formatter={(value) => numberFormatter.format(value)} />}
          </StatSection>

          <StatSection title="Fidélité clients" description="Les délais sont calculés sur les clients ayant plusieurs consultations, toutes périodes confondues.">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactValue label="Nouveaux clients" value={numberFormatter.format(stats.loyalty.newClients)} />
              <CompactValue label="Clients déjà connus" value={numberFormatter.format(stats.loyalty.returningClients)} />
              <CompactValue label="Taux de retour" value={`${stats.loyalty.returnRate} %`} accent />
              <CompactValue label="Délai moyen entre deux consultations" value={stats.loyalty.averageDelayMonths != null ? `${stats.loyalty.averageDelayMonths.toLocaleString("fr-FR")} mois` : "—"} />
            </div>
          </StatSection>

          <StatSection title="Annulations" description="Fiabilité des rendez-vous réservés sur la période.">
            <div className="grid gap-3 sm:grid-cols-2">
              <CompactValue label="RDV réservés" value={numberFormatter.format(stats.cancellations.totalBooked)} />
              <CompactValue label="RDV honorés" value={numberFormatter.format(stats.cancellations.honored)} />
              <CompactValue label="Annulés" value={numberFormatter.format(stats.cancellations.cancelled)} />
              <CompactValue label="Taux d’annulation" value={`${stats.cancellations.cancellationRate} %`} accent />
            </div>
          </StatSection>

          <StatSection title="Performance des rappels" description="Rendez-vous repris après l’envoi d’un rappel client, sur la période.">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactValue label="Rappels envoyés" value={numberFormatter.format(stats.reminders.sent)} />
              <CompactValue label="Rendez-vous repris" value={numberFormatter.format(stats.reminders.bookedAgain)} />
              <CompactValue label="Taux de reprise" value={`${stats.reminders.returnRate} %`} accent />
            </div>
          </StatSection>

          <StatSection title="Activité par zone" description="Classement selon le chiffre d’affaires réalisé, zones configurées dans Tournées.">
            {stats.zones.length === 0 ? <EmptyState /> : (
              <div className="space-y-5">
                {stats.zones.map((zone, index) => (
                  <div key={zone.label}>
                    <div className="mb-2 flex items-start justify-between gap-4">
                      <div className="flex items-center gap-3"><span className="flex h-7 w-7 items-center justify-center rounded-[9px] bg-animeo-soft text-xs font-black text-animeo-dark">{index + 1}</span><div><p className="font-extrabold text-animeo-dark">{zone.label}</p><p className="text-xs text-animeo-muted">{zone.consultations} consultation{zone.consultations > 1 ? "s" : ""} · {zone.clients} client{zone.clients > 1 ? "s" : ""}</p></div></div>
                      <strong className="text-sm text-animeo-dark">{currencyFormatter.format(zone.revenue)}</strong>
                    </div>
                    <div className="ml-10 h-1.5 overflow-hidden rounded-full bg-animeo-bg"><div className="h-full rounded-full bg-animeo" style={{ width: `${(zone.revenue / (stats.zones[0]?.revenue || 1)) * 100}%` }} /></div>
                  </div>
                ))}
              </div>
            )}
          </StatSection>

          <StatSection title="Consultations à domicile" description="Performance des consultations réalisées au domicile du client.">
            <div className="grid gap-3 sm:grid-cols-3">
              <CompactValue label="Consultations à domicile" value={numberFormatter.format(stats.home.consultations)} />
              <CompactValue label="CA total domicile" value={currencyFormatter.format(stats.home.revenue)} accent />
              <CompactValue label="CA moyen / consultation" value={currencyFormatter.format(stats.home.averageRevenue)} />
            </div>
          </StatSection>
        </div>
      </div>

      <p className="py-6 text-center text-xs text-animeo-muted">Données calculées à partir des rendez-vous réellement enregistrés (statut Terminé) sur la période sélectionnée.</p>
    </>
  );
}

function DataLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-center justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="font-extrabold text-animeo-dark">{value}</dd></div>;
}

function CompactValue({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div className="rounded-[14px] border border-[var(--theme-border)] bg-animeo-bg p-4"><p className="text-xs font-bold leading-5 text-animeo-muted">{label}</p><p className={`mt-1 text-xl font-black ${accent ? "text-animeo" : "text-animeo-dark"}`}>{value}</p></div>;
}

function EmptyState() {
  return <p className="rounded-[14px] border border-dashed border-[var(--theme-border)] bg-animeo-bg p-6 text-center text-sm font-semibold text-animeo-muted">Aucune donnée sur la période et les filtres sélectionnés.</p>;
}
