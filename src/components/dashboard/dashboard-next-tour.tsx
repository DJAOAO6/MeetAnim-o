"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
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
    <Card className="overflow-hidden p-5 sm:p-6">
      <div className="mb-4 flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="map" className="h-5 w-5" /></span>
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Prochaine tournée</p>
          <h2 className="mt-0.5 font-black text-animeo-dark">{nextTour ? nextTour.name : "Aucune tournée programmée"}</h2>
        </div>
      </div>

      {nextTour ? (
        <>
          <p className="mb-1 text-sm font-bold text-animeo-dark">{zone?.name ?? "Zone non définie"}</p>
          <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1 text-sm text-animeo-muted">
            <span>{nextTour.appointmentCount} rendez-vous</span>
            {nextTour.estimatedDistanceKm !== null ? <span>≈ {Math.round(nextTour.estimatedDistanceKm)} km</span> : null}
            <span>{nextTour.day} · {nextTour.startTime}</span>
          </div>
          <SimulatedMap points={points} heightClassName="h-40" showLabels={false} />
          <div className="mt-4 flex flex-wrap gap-2">
            {mapsResult.links.map((link) => (
              <a key={link.label} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-2xl bg-animeo px-4 py-3 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
                <Icon name="car" className="h-4 w-4" />
                {mapsResult.links.length > 1 ? link.label : "Itinéraire"}
              </a>
            ))}
            <Link href="/dashboard/tournees" className="flex flex-1 items-center justify-center rounded-2xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">
              Voir la tournée
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-animeo-muted">Aucune tournée active n’est programmée dans les prochains jours.</p>
          <Link href="/dashboard/tournees" className="mt-4 flex w-full items-center justify-center rounded-2xl bg-animeo-soft px-4 py-3 text-sm font-extrabold text-animeo-dark transition hover:bg-[#dceee9]">
            Gérer les tournées
          </Link>
        </>
      )}
    </Card>
  );
}
