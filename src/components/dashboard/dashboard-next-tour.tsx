"use client";

import Link from "next/link";
import { useMemo } from "react";
import { DashboardCard, DashboardEmptyState, dashboardFooterLinkClassName } from "@/components/dashboard/dashboard-card";
import { Icon } from "@/components/ui/icon";
import { SimulatedMap } from "@/components/tours/simulated-map";
import { referenceDate } from "@/components/dashboard/dashboard-date";
import { buildTourMapsLinks } from "@/lib/tour-maps";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

const weekdayOrder = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

function nextOccurrenceInDays(tour: Tour): number | null {
  const today = referenceDate();

  if (tour.dateId) {
    const [year, month, day] = tour.dateId.split("-").map(Number);
    const target = new Date(year, month - 1, day, 12);
    const diff = Math.round((target.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
    return diff >= 0 ? diff : null;
  }

  const dayIndex = weekdayOrder.indexOf(tour.day);
  if (dayIndex === -1) return null;
  const todayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1;
  return (dayIndex - todayIndex + 7) % 7;
}

export function DashboardNextTour({ tours, zones, tourAppointments }: { tours: Tour[]; zones: Zone[]; tourAppointments: Record<string, TourAppointment[]> }) {
  const nextTour = useMemo(() => {
    const candidates = tours
      .filter((tour) => tour.status === "Active")
      .map((tour) => ({ tour, daysUntil: nextOccurrenceInDays(tour) }))
      .filter((entry): entry is { tour: Tour; daysUntil: number } => entry.daysUntil !== null)
      .sort((first, second) => first.daysUntil - second.daysUntil);

    return candidates[0]?.tour;
  }, [tours]);

  const zone = zones.find((item) => item.id === nextTour?.zoneId);
  const appointments = nextTour ? tourAppointments[nextTour.id] ?? [] : [];
  const mapsResult = buildTourMapsLinks(
    nextTour?.startCoordinates ?? null,
    appointments.map((appointment) => ({ coordinates: appointment.coordinates })),
  );
  // Un arrêt sans position réelle n'apparaît pas sur la carte (simulée) —
  // jamais de position devinée.
  const points = appointments
    .map((appointment, index) => ({ appointment, index }))
    .filter((entry): entry is { appointment: TourAppointment & { position: { x: number; y: number } }; index: number } => entry.appointment.position !== null)
    .map(({ appointment, index }) => ({
      id: appointment.id,
      x: appointment.position.x,
      y: appointment.position.y,
      label: `${index + 1}`,
      title: `${appointment.time} · ${appointment.animalName} · ${appointment.city}`,
      accent: "purple" as const,
    }));

  return (
    <DashboardCard
      className="overflow-hidden"
      icon="map"
      eyebrow="Prochaine tournée"
      title={nextTour ? nextTour.name : "Aucune tournée programmée"}
      subtitle={nextTour ? (zone?.name ?? "Zone non définie") : undefined}
      footer={
        nextTour ? (
          <div className="flex flex-wrap gap-2">
            {mapsResult.links.map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-2xl bg-animeo px-4 text-sm font-extrabold text-white transition hover:bg-animeo-hover">
                <Icon name="car" className="h-4 w-4" />
                {mapsResult.links.length > 1 ? link.label : "Itinéraire"}
              </a>
            ))}
            <Link href="/dashboard/tournees" className={`flex-1 ${dashboardFooterLinkClassName()}`}>Voir la tournée</Link>
          </div>
        ) : (
          <Link href="/dashboard/tournees" className={dashboardFooterLinkClassName()}>Gérer les tournées</Link>
        )
      }
    >
      {nextTour ? (
        <>
          {/* Les trois repères que l'on cherche avant de partir : combien
              d'arrêts, quelle distance, à quelle heure. */}
          <dl className="mb-[var(--dashboard-card-gap)] grid grid-cols-3 gap-2 rounded-2xl bg-animeo-bg p-3 text-center">
            <TourFigure value={String(nextTour.appointmentCount)} label="rendez-vous" />
            <TourFigure value={nextTour.estimatedDistanceKm !== null ? `${Math.round(nextTour.estimatedDistanceKm)} km` : "—"} label="distance" />
            <TourFigure value={nextTour.startTime} label={nextTour.day.toLocaleLowerCase("fr-FR")} />
          </dl>
          <SimulatedMap points={points} heightClassName="h-36" showLabels={false} />
        </>
      ) : (
        <DashboardEmptyState
          icon="map"
          title="Rien de prévu"
          message="Aucune tournée active n’est programmée dans les prochains jours."
        />
      )}
    </DashboardCard>
  );
}

function TourFigure({ value, label }: { value: string; label: string }) {
  return (
    <div className="min-w-0">
      <dt className="sr-only">{label}</dt>
      <dd className="truncate text-base font-black text-animeo-dark">{value}</dd>
      <p aria-hidden="true" className="truncate text-[11px] font-bold text-animeo-muted">{label}</p>
    </div>
  );
}
