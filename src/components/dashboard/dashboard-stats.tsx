"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { formatEuros } from "@/lib/format";
import { hasPermission } from "@/lib/auth/permissions";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";
import type { Client } from "@/data/clients";

export function DashboardStats({ clients, dueReminders }: { clients: Client[]; dueReminders: number }) {
  const { appointments } = useAppointments();
  const currentUser = useCurrentUser();
  const canViewFinances = hasPermission(currentUser, "VIEW_FINANCES");

  const stats = useMemo(() => {
    const today = referenceDate();
    const todayId = dateId(today);
    const weekIds = new Set(weekDatesFrom(startOfWeek(today)).map(dateId));
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
      return created.getFullYear() === today.getFullYear() && created.getMonth() === today.getMonth();
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
    // Deux colonnes dès 320 px : en une seule colonne, ces cinq cartes
    // occupaient trois écrans de haut avant le premier contenu utile
    // (planning, rappels). Le chiffre reste le repère principal, l'icône et
    // le détail passent au second plan en dessous de sm.
    <div className="mb-6 grid grid-cols-2 items-start gap-3 sm:gap-4 xl:grid-cols-5">
      {cards.map((card) => (
        <Card key={card.label} className="flex items-start gap-3 p-4 sm:gap-4 sm:p-5">
          <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-full bg-animeo-soft text-animeo-brand sm:flex">
            <Icon name={card.icon} className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold leading-snug text-animeo-muted sm:text-sm">{card.label}</p>
            <p className="mt-1 text-2xl font-black text-animeo-dark sm:text-3xl">{card.value}</p>
            <p className="mt-1 hidden text-xs text-animeo-muted sm:block">{card.detail}</p>
          </div>
        </Card>
      ))}
    </div>
  );
}
