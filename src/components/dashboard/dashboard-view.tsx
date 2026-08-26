"use client";

import { useMemo } from "react";
import { DashboardAvailabilityControls } from "@/components/availability/dashboard-availability-controls";
import { DashboardActivity } from "@/components/dashboard/dashboard-activity";
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
      <DashboardHeader reminders={reminders} />
      <DashboardAvailabilityControls />
      <DashboardStats clients={clients} dueReminders={dueReminders} />

      <div className="mb-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <DashboardPlanning />
        <div className="grid gap-6">
          <DashboardNextTour tours={tours} zones={zones} tourAppointments={tourAppointments} />
          <DashboardRemindersCard reminders={reminders} />
        </div>
      </div>

      <DashboardActivity clients={clients} />
    </>
  );
}
