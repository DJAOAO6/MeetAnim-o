"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { RevenueChart } from "@/components/stats/stats-ui";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";

const weekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function capitalize(value: string) {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1).replace(".", "");
}

export function DashboardActivityChart() {
  const { appointments } = useAppointments();

  const series = useMemo(() => {
    const weekDates = weekDatesFrom(startOfWeek(referenceDate()));
    const active = appointments.filter((appointment) => appointment.status !== "cancelled");

    return weekDates.map((date) => {
      const id = dateId(date);
      const value = active.filter((appointment) => appointment.date === id).length;
      return { label: capitalize(weekdayFormatter.format(date)), value };
    });
  }, [appointments]);

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
