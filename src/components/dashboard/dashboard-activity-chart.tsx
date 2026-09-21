"use client";

import { useEffect, useMemo, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { PeriodSelect, type DashboardPeriod } from "@/components/dashboard/dashboard-period";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { RevenueChart } from "@/components/stats/stats-ui";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1).replace(".", "");
}

const subtitles: Record<DashboardPeriod, string> = {
  week: "Un point par jour",
  month: "Un point par semaine",
  year: "Un point par mois",
};

/**
 * Nombre de rendez-vous sur la période, en courbe.
 *
 * Le pas de la courbe suit la période choisie : trente points quotidiens sur
 * un mois ne se lisent pas dans une carte de cette largeur, alors que cinq
 * points hebdomadaires racontent la même chose. Le sous-titre dit toujours
 * ce qu'un point représente — une courbe dont on ignore le pas ne veut rien
 * dire.
 *
 * referenceDate() lit l'horloge de la machine qui exécute le code : le rendu
 * serveur et la première passe client peuvent calculer des semaines
 * différentes près de minuit ou entre deux fuseaux, ce qui provoque un vrai
 * écart d'hydratation (AUDIT_COMPLET.md P2-18). useHasMounted garantit que
 * les deux affichent d'abord la même courbe vide.
 */
export function DashboardActivityChart() {
  const { appointments, ensureRange } = useAppointments();
  const mounted = useHasMounted();
  const [period, setPeriod] = useState<DashboardPeriod>("week");
  // La vue « année » couvre janvier à décembre, au-delà de la fenêtre
  // chargée d'office : on la demande quand elle est choisie.
  useEffect(() => {
    if (period === "year") {
      const year = new Date().getFullYear();
      void ensureRange(`${year}-01-01`, `${year}-12-31`);
    }
  }, [ensureRange, period]);

  const series = useMemo(() => {
    if (!mounted) return [];
    const active = appointments.filter((appointment) => appointment.status !== "cancelled");
    const countBetween = (from: string, to: string) => active.filter((appointment) => appointment.date >= from && appointment.date <= to).length;
    const today = referenceDate();

    if (period === "week") {
      return weekDatesFrom(startOfWeek(today)).map((date) => {
        const id = dateId(date);
        return { label: capitalize(weekdayFormatter.format(date)), value: countBetween(id, id) };
      });
    }

    if (period === "month") {
      // Semaines calendaires du mois courant, bornées au mois : la dernière
      // semaine peut n'en compter que deux jours, et c'est juste ainsi.
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      const points: Array<{ label: string; value: number }> = [];
      let cursor = startOfWeek(first);
      let index = 1;
      while (cursor <= last) {
        const days = weekDatesFrom(cursor).map(dateId).filter((id) => id >= dateId(first) && id <= dateId(last));
        if (days.length > 0) {
          points.push({ label: `S${index}`, value: countBetween(days[0], days[days.length - 1]) });
          index += 1;
        }
        cursor = new Date(cursor.getTime() + 7 * 24 * 60 * 60 * 1000);
      }
      return points;
    }

    return Array.from({ length: 12 }, (_, month) => {
      const start = new Date(today.getFullYear(), month, 1);
      const end = new Date(today.getFullYear(), month + 1, 0);
      return { label: capitalize(monthFormatter.format(start)), value: countBetween(dateId(start), dateId(end)) };
    });
  }, [mounted, appointments, period]);

  return (
    <DashboardCard
      icon="stats"
      title="Rendez-vous"
      subtitle={subtitles[period]}
      action={<PeriodSelect value={period} onChange={setPeriod} label="Période du graphique" />}
    >
      <RevenueChart
        data={series}
        title="Nombre de rendez-vous sur la période"
        ariaLabel="Nombre de rendez-vous sur la période"
        valueSuffix=""
        roundStep={2}
        // La courbe vit ici dans une carte bien plus étroite que la page
        // Statistiques : sans cette largeur minimale réduite, elle imposait un
        // défilement horizontal dans sa propre carte dès 1024 px.
        minWidthClassName="min-w-[320px]"
      />
    </DashboardCard>
  );
}
