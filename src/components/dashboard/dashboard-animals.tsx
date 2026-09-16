"use client";

import { useMemo, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { DashboardCard, DashboardEmptyState } from "@/components/dashboard/dashboard-card";
import { PeriodSelect, useDashboardPeriod, type DashboardPeriod } from "@/components/dashboard/dashboard-period";
import { SimpleBarChart } from "@/components/stats/stats-ui";
import { resolveSpeciesColor, type AnimalSpecies } from "@/data/species";

/**
 * Répartition par espèce des animaux **réellement reçus** sur la période.
 *
 * La version précédente comptait les animaux du fichier clients : elle
 * répondait donc à « quelles espèces ai-je en fiche ? » sous le titre
 * « Animaux vus ». Deux questions différentes, et c'est la seconde qui a sa
 * place sur un tableau de bord — un cheval enregistré il y a trois ans n'est
 * pas un cheval vu cette semaine.
 *
 * Un même animal reçu deux fois compte une fois : la carte décrit des animaux,
 * pas des rendez-vous (le nombre de rendez-vous est déjà un chiffre clé).
 */
export function DashboardAnimals() {
  const { appointments } = useAppointments();
  const { theme } = useDashboardTheme();
  const [period, setPeriod] = useState<DashboardPeriod>("month");
  const { contains, mounted } = useDashboardPeriod(period);

  const { breakdown, total } = useMemo(() => {
    if (!mounted) return { breakdown: [], total: 0 };

    const seen = new Map<AnimalSpecies, Set<string>>();
    for (const appointment of appointments) {
      if (appointment.status === "cancelled" || appointment.status === "pending") continue;
      if (!appointment.animalSpecies || !contains(appointment.date)) continue;
      // Clé de l'animal : son identifiant quand il est connu, sinon son nom
      // associé au client — deux « Rio » de deux familles restent deux animaux.
      const key = appointment.animalId ?? `${appointment.clientName}·${appointment.animalName}`;
      const bucket = seen.get(appointment.animalSpecies) ?? new Set<string>();
      bucket.add(key);
      seen.set(appointment.animalSpecies, bucket);
    }

    const counted = [...seen.entries()].map(([species, animals]) => ({ species, count: animals.size }));
    const sum = counted.reduce((accumulator, entry) => accumulator + entry.count, 0);
    if (sum === 0) return { breakdown: [], total: 0 };

    return {
      total: sum,
      breakdown: counted
        .map((entry) => ({
          label: entry.species,
          value: Math.round((entry.count / sum) * 100),
          color: resolveSpeciesColor(theme.speciesColors, entry.species),
        }))
        .sort((first, second) => second.value - first.value),
    };
  }, [appointments, contains, mounted, theme]);

  return (
    <DashboardCard
      icon="paw"
      title="Animaux vus"
      subtitle={total > 0 ? `${total} ${total > 1 ? "animaux reçus" : "animal reçu"}` : undefined}
      action={<PeriodSelect value={period} onChange={setPeriod} label="Période des animaux vus" />}
    >
      {breakdown.length > 0 ? (
        <SimpleBarChart items={breakdown} maxValue={100} />
      ) : (
        <DashboardEmptyState
          icon="paw"
          title="Aucun animal reçu"
          message="La répartition par espèce apparaîtra dès le premier rendez-vous honoré sur la période."
        />
      )}
    </DashboardCard>
  );
}
