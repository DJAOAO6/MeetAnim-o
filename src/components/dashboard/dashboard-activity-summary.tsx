"use client";

import { useMemo } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { dateId, referenceDate } from "@/components/dashboard/dashboard-date";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import type { Client } from "@/data/clients";

/**
 * Le portrait du cabinet, à côté des chiffres du jour.
 *
 * Cette carte affichait auparavant « Total rendez-vous · cette semaine », qui
 * répétait mot pour mot le chiffre clé « Cette semaine » situé quelques
 * centimètres plus haut. Un tableau de bord qui donne deux fois la même
 * donnée fait douter de toutes les autres.
 *
 * Elle réunit donc désormais quatre informations qui ne figurent nulle part
 * ailleurs sur cet écran, et toutes calculées à partir des données déjà
 * chargées — aucune requête supplémentaire.
 */
export function DashboardActivitySummary({ clients }: { clients: Client[] }) {
  const { appointments } = useAppointments();
  // Les mesures « ce mois-ci » dépendent de la date d'exécution : calculées
  // seulement après montage, pour que serveur et navigateur rendent la même
  // chose au premier passage.
  const mounted = useHasMounted();

  const animals = useMemo(() => clients.reduce((total, client) => total + client.animals.length, 0), [clients]);
  const activeClients = useMemo(() => clients.filter((client) => client.status === "Actif").length, [clients]);

  const { averageDuration, topService } = useMemo(() => {
    if (!mounted) return { averageDuration: null as number | null, topService: null as string | null };

    const monthPrefix = dateId(referenceDate()).slice(0, 7);
    const honoured = appointments.filter(
      (appointment) => appointment.date.startsWith(monthPrefix) && (appointment.status === "confirmed" || appointment.status === "completed"),
    );
    if (honoured.length === 0) return { averageDuration: null, topService: null };

    const totalDuration = honoured.reduce((sum, appointment) => sum + appointment.duration, 0);

    const counts = new Map<string, number>();
    for (const appointment of honoured) {
      if (!appointment.serviceName) continue;
      counts.set(appointment.serviceName, (counts.get(appointment.serviceName) ?? 0) + 1);
    }
    const best = [...counts.entries()].sort((first, second) => second[1] - first[1])[0];

    return { averageDuration: Math.round(totalDuration / honoured.length), topService: best?.[0] ?? null };
  }, [appointments, mounted]);

  const rows: Array<{ value: string; label: string }> = [
    { value: String(animals), label: animals > 1 ? "Animaux suivis" : "Animal suivi" },
    { value: String(activeClients), label: activeClients > 1 ? "Clients actifs" : "Client actif" },
    { value: averageDuration === null ? "—" : `${averageDuration} min`, label: "Durée moyenne ce mois-ci" },
    { value: topService ?? "—", label: "Prestation la plus demandée" },
  ];

  return (
    <DashboardCard icon="stats" title="Mon activité" subtitle="Votre cabinet en résumé">
      <dl className="space-y-[var(--dashboard-card-gap)]">
        {rows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-3 border-b border-animeo-border-soft pb-[var(--dashboard-card-gap)] last:border-b-0 last:pb-0">
            <dt className="min-w-0 text-xs font-bold text-animeo-muted">{row.label}</dt>
            <dd className="shrink-0 truncate text-right text-lg font-black text-animeo-dark">{row.value}</dd>
          </div>
        ))}
      </dl>
    </DashboardCard>
  );
}
