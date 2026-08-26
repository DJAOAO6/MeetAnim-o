"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { RevenueChart, SimpleBarChart } from "@/components/stats/stats-ui";
import { animalSpeciesList, resolveSpeciesColor } from "@/data/species";
import { dateId, referenceDate, weekDatesFrom } from "@/components/dashboard/dashboard-date";
import type { Client } from "@/data/clients";

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1).replace(".", "");
}

export function DashboardActivity({ clients }: { clients: Client[] }) {
  const { appointments } = useAppointments();
  const { theme } = useDashboardTheme();

  const { series, weekTotal, previousWeekTotal } = useMemo(() => {
    const weekDates = weekDatesFrom(referenceDate);
    const previousWeekStart = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
    const previousWeekIds = new Set(weekDatesFrom(previousWeekStart).map(dateId));
    const active = appointments.filter((appointment) => appointment.status !== "cancelled");

    const daySeries = weekDates.map((date) => {
      const id = dateId(date);
      const value = active.filter((appointment) => appointment.date === id).length;
      return { label: capitalize(weekdayFormatter.format(date)), value };
    });

    const total = daySeries.reduce((sum, day) => sum + day.value, 0);
    const previousTotal = active.filter((appointment) => previousWeekIds.has(appointment.date)).length;

    return { series: daySeries, weekTotal: total, previousWeekTotal: previousTotal };
  }, [appointments]);

  const variation = previousWeekTotal > 0 ? Math.round(((weekTotal - previousWeekTotal) / previousWeekTotal) * 100) : null;

  const speciesBreakdown = useMemo(() => {
    const counts = new Map<string, number>();
    let totalAnimals = 0;
    for (const client of clients) {
      for (const animal of client.animals) {
        counts.set(animal.species, (counts.get(animal.species) ?? 0) + 1);
        totalAnimals += 1;
      }
    }
    if (totalAnimals === 0) return [];
    return animalSpeciesList
      .map((species) => ({ label: species, value: Math.round(((counts.get(species) ?? 0) / totalAnimals) * 100), color: resolveSpeciesColor(theme.speciesColors, species) }))
      .filter((item) => item.value > 0)
      .sort((first, second) => second.value - first.value);
  }, [clients, theme]);

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-5 sm:p-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="stats" className="h-5 w-5" /></span>
            <h2 className="font-black text-animeo-dark">Activité de la semaine</h2>
          </div>
        </div>
        <RevenueChart data={series} title="Rendez-vous par jour cette semaine" ariaLabel="Nombre de rendez-vous par jour cette semaine" valueSuffix="" roundStep={2} />
      </Card>

      <div className="grid gap-6">
        <Card className="p-5 sm:p-6">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="calendar" className="h-5 w-5" /></div>
          <p className="mt-4 text-sm font-bold text-animeo-muted">Total rendez-vous</p>
          <p className="mt-1 text-3xl font-black text-animeo-dark">{weekTotal}</p>
          <p className="mt-2 text-xs font-bold text-animeo-muted">
            {variation === null ? "Cette semaine" : variation >= 0 ? `+${variation} % vs semaine précédente` : `${variation} % vs semaine précédente`}
          </p>
        </Card>

        <Card className="p-5 sm:p-6">
          <p className="text-sm font-bold text-animeo-muted">Animaux vus</p>
          {speciesBreakdown.length > 0 ? (
            <div className="mt-4">
              <SimpleBarChart items={speciesBreakdown} />
            </div>
          ) : (
            <p className="mt-3 text-sm text-animeo-muted">Aucun animal enregistré pour le moment.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
