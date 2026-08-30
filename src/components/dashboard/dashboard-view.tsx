"use client";

import { useMemo } from "react";
import { DashboardAvailabilityControls } from "@/components/availability/dashboard-availability-controls";
import { DashboardActivityChart } from "@/components/dashboard/dashboard-activity-chart";
import { DashboardActivitySummary } from "@/components/dashboard/dashboard-activity-summary";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { DashboardNextTour } from "@/components/dashboard/dashboard-next-tour";
import { DashboardPlanning } from "@/components/dashboard/dashboard-planning";
import { DashboardRemindersCard } from "@/components/dashboard/dashboard-reminders-card";
import { DashboardStats } from "@/components/dashboard/dashboard-stats";
import type { DashboardOverviewData } from "@/lib/dashboard-overview";

export function DashboardView({ clients, tours, zones, tourAppointments, reminders }: DashboardOverviewData) {
  const dueReminders = useMemo(() => reminders.filter((reminder) => reminder.status === "À relancer").length, [reminders]);

  return (
    <>
      <DashboardHeader />
      <DashboardAvailabilityControls />
      <DashboardStats clients={clients} dueReminders={dueReminders} />

      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <div className="grid grid-cols-1 items-start gap-6">
          <DashboardPlanning clients={clients} />
          <DashboardActivityChart />
        </div>
        {/* xl:pr-24 : réserve un dégagement à droite pour le cluster de
            boutons flottants (DashboardFloatingActions, fixed bottom-right)
            — sans cette marge, la carte « Prochaine tournée » peut se
            retrouver recouverte par les boutons sur les hauteurs d'écran
            courantes (~720-800px). Scopé à cette seule colonne (pas au
            layout partagé) pour ne pas rogner la largeur de l'Agenda, qui
            en a besoin en entier sur les mêmes largeurs d'écran. */}
        <div className="grid grid-cols-1 items-start gap-6 xl:pr-24">
          <DashboardNextTour tours={tours} zones={zones} tourAppointments={tourAppointments} />
          <DashboardRemindersCard reminders={reminders} />
          <DashboardActivitySummary clients={clients} />
        </div>
      </div>
    </>
  );
}
