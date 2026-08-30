"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { RevenueChart } from "@/components/stats/stats-ui";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1).replace(".", "");
}

export function DashboardActivityChart() {
  const { appointments } = useAppointments();

  // referenceDate() lit l'horloge murale de l'environnement d'exécution :
  // le rendu SSR (fuseau du serveur) et la première passe client (fuseau du
  // navigateur de l'utilisateur) peuvent donc calculer des dates de semaine
  // différentes près de minuit ou quand les fuseaux diffèrent, provoquant un
  // vrai mismatch d'hydratation React — AUDIT_COMPLET.md P2-18. useHasMounted
  // garantit que le HTML SSR et la première passe client affichent tous
  // deux un graphique vide identique ; la vraie série n'est calculée
  // qu'ensuite, une fois côté client.
  const mounted = useHasMounted();

  const series = useMemo(() => {
    if (!mounted) return [];
    const weekDates = weekDatesFrom(startOfWeek(referenceDate()));
    const active = appointments.filter((appointment) => appointment.status !== "cancelled");

    return weekDates.map((date) => {
      const id = dateId(date);
      const value = active.filter((appointment) => appointment.date === id).length;
      return { label: capitalize(weekdayFormatter.format(date)), value };
    });
  }, [mounted, appointments]);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="stats" className="h-5 w-5" /></span>
          <h2 className="font-black text-animeo-dark">Activité de la semaine</h2>
        </div>
      </div>
      <RevenueChart data={series} title="Rendez-vous par jour cette semaine" ariaLabel="Nombre de rendez-vous par jour cette semaine" valueSuffix="" roundStep={2} />
    </Card>
  );
}
