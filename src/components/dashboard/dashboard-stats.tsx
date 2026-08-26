"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatEuros } from "@/lib/format";
import { hasPermission } from "@/lib/auth/permissions";
import { dateId, referenceDate, weekDatesFrom } from "@/components/dashboard/dashboard-date";
import type { Client } from "@/data/clients";

export function DashboardStats({ clients, dueReminders }: { clients: Client[]; dueReminders: number }) {
  const { appointments } = useAppointments();
  const currentUser = useCurrentUser();
  const canViewFinances = hasPermission(currentUser, "VIEW_FINANCES");

  const stats = useMemo(() => {
    const todayId = dateId(referenceDate);
    const weekIds = new Set(weekDatesFrom(referenceDate).map(dateId));
    const active = appointments.filter((appointment) => appointment.status !== "cancelled");

    const monthPrefix = todayId.slice(0, 7);

    const todayCount = active.filter((appointment) => appointment.date === todayId).length;
    const weekCount = active.filter((appointment) => weekIds.has(appointment.date)).length;
    const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;
    const revenue = active
      .filter((appointment) => appointment.date.startsWith(monthPrefix) && (appointment.status === "confirmed" || appointment.status === "completed"))
      .reduce((sum, appointment) => sum + appointment.price, 0);

    const newClients = clients.filter((client) => {
      const created = new Date(client.createdAt);
      return created.getFullYear() === referenceDate.getFullYear() && created.getMonth() === referenceDate.getMonth();
    }).length;

    return { todayCount, weekCount, pendingCount, revenue, newClients };
  }, [appointments, clients]);

  const cards: Array<{ label: string; value: string; detail: string; icon: IconName }> = [
    { label: "Rendez-vous aujourd’hui", value: String(stats.todayCount), detail: "Programmés pour aujourd’hui", icon: "calendar" },
    { label: "Cette semaine", value: String(stats.weekCount), detail: "Du lundi au dimanche", icon: "agenda" },
    { label: "Nouveaux clients", value: String(stats.newClients), detail: "Ce mois-ci", icon: "clients" },
    canViewFinances
      ? { label: "Chiffre d’affaires", value: formatEuros(stats.revenue), detail: "Ce mois-ci", icon: "euro" }
      : { label: "Rappels à envoyer", value: String(dueReminders), detail: "Clients à relancer", icon: "bell" },
    { label: "Demandes en attente", value: String(stats.pendingCount), detail: "À accepter ou refuser", icon: "shield" },
  ];

  return (
    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="p-5">
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
            <Icon name={card.icon} className="h-5 w-5" />
          </div>
          <p className="text-sm font-bold leading-snug text-animeo-muted">{card.label}</p>
          <p className="mt-2 text-3xl font-black text-animeo-dark">{card.value}</p>
          <p className="mt-2 text-xs text-animeo-muted">{card.detail}</p>
        </Card>
      ))}
    </div>
  );
}
