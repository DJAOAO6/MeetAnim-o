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

type Kpi = { label: string; value: string; detail: string; icon: IconName };

export function DashboardStats({ clients }: { clients: Client[] }) {
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
    const monthCount = active.filter((appointment) => appointment.date.startsWith(monthPrefix)).length;
    const revenue = active
      .filter((appointment) => appointment.date.startsWith(monthPrefix) && (appointment.status === "confirmed" || appointment.status === "completed"))
      .reduce((sum, appointment) => sum + appointment.price, 0);

    const newClients = clients.filter((client) => {
      const created = new Date(client.createdAt);
      return created.getFullYear() === today.getFullYear() && created.getMonth() === today.getMonth();
    }).length;

    return { todayCount, weekCount, monthCount, pendingCount, revenue, newClients };
  }, [appointments, clients]);

  const cards: Kpi[] = [
    { label: "Rendez-vous aujourd’hui", value: String(stats.todayCount), detail: "Programmés aujourd’hui", icon: "calendar" },
    { label: "Cette semaine", value: String(stats.weekCount), detail: "Du lundi au dimanche", icon: "agenda" },
    { label: "Nouveaux clients", value: String(stats.newClients), detail: "Ce mois-ci", icon: "clients" },
    // Sans la permission « voir les chiffres », un autre indicateur prend la
    // place du chiffre d'affaires — mais surtout pas le nombre de rappels :
    // la carte « Rappels à envoyer » du bas de page l'affiche déjà, et une
    // donnée montrée deux fois fait douter de toutes les autres.
    canViewFinances
      ? { label: "Chiffre d’affaires", value: formatEuros(stats.revenue), detail: "Ce mois-ci", icon: "euro" }
      : { label: "Rendez-vous ce mois-ci", value: String(stats.monthCount), detail: "Depuis le 1er du mois", icon: "agenda" },
    { label: "Demandes en attente", value: String(stats.pendingCount), detail: "À accepter ou refuser", icon: "shield" },
  ];

  return (
    // Deux colonnes dès 320 px : en une seule colonne, ces cinq cartes
    // occupaient trois écrans de haut avant le premier contenu utile.
    <div className="grid grid-cols-2 gap-[var(--dashboard-gap)] sm:grid-cols-3 xl:grid-cols-5">
      {cards.map((card) => <KpiCard key={card.label} {...card} />)}
    </div>
  );
}

/**
 * Carte de chiffre clé, à structure **fixe**.
 *
 * C'est tout l'enjeu : avant, le libellé était placé au-dessus du chiffre, si
 * bien qu'un libellé sur deux lignes (« Rendez-vous aujourd'hui ») descendait
 * son chiffre d'une ligne par rapport à son voisin (« Cette semaine »). Les
 * cinq chiffres ne tombaient jamais à la même hauteur.
 *
 * Ici, chaque zone a sa place, quelle que soit la longueur du texte :
 * l'icône en haut, le libellé sur une hauteur réservée de deux lignes, le
 * chiffre, puis le détail poussé en bas par `mt-auto`. Les cinq cartes se
 * superposent donc exactement, y compris quand l'une d'elles affiche
 * « 1 096 € » et l'autre « 0 ».
 */
function KpiCard({ label, value, detail, icon }: Kpi) {
  return (
    <Card data-testid="kpi-card" className="flex h-full flex-col p-[var(--dashboard-card-padding)]">
      <span aria-hidden="true" className="mb-3 flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-brand">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      {/* Hauteur réservée à deux lignes : un libellé court et un libellé long
          laissent le chiffre exactement au même endroit. */}
      <p className="flex min-h-[2.5rem] items-start text-xs font-bold leading-snug text-animeo-muted sm:text-sm">{label}</p>
      <p data-testid="kpi-value" className="mt-1 text-2xl font-black leading-none text-animeo-dark sm:text-3xl">{value}</p>
      <p className="mt-auto pt-2 text-xs text-animeo-muted">{detail}</p>
    </Card>
  );
}
