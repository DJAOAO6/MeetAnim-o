import { getDayAvailability } from "@/lib/availability";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import type { Appointment } from "@/data/appointments";
import type { AvailabilitySettings } from "@/data/settings";
import type { Tour } from "@/data/tours";

export type DayItemKind = "cabinet" | "domicile" | "pending" | "tournee";

export type DayItem = {
  id: string;
  start: string;
  duration: number;
  kind: DayItemKind;
  title: string;
  subtitle: string;
  appointmentId?: string;
  tourId?: string;
};

export type DayAgenda = {
  items: DayItem[];
  count: number;
  isClosed: boolean;
};

export function dateId(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/**
 * Regroupe les vraies données (rendez-vous + tournées) pour une journée
 * donnée, en respectant les disponibilités réelles. Source unique utilisée
 * par les vues Jour/Semaine/Mois/Année pour éviter toute divergence.
 */
export function getDayAgenda(date: Date, appointments: Appointment[], tours: Tour[], availability: AvailabilitySettings): DayAgenda {
  const { open } = getDayAvailability(date, availability);
  if (!open) return { items: [], count: 0, isClosed: true };

  const id = dateId(date);
  const weekday = weekdayLabelFor(date);
  const items: DayItem[] = [];

  for (const appointment of appointments) {
    if (appointment.date !== id || appointment.status === "cancelled") continue;
    items.push({
      id: appointment.id,
      appointmentId: appointment.id,
      start: appointment.start,
      duration: appointment.duration,
      kind: appointment.status === "pending" ? "pending" : appointment.mode === "cabinet" ? "cabinet" : "domicile",
      title: appointment.animalName,
      subtitle: appointment.mode === "cabinet" ? appointment.clientName : `${appointment.clientName} · ${appointment.location}`,
    });
  }

  for (const tour of tours) {
    if (tour.status !== "Active") continue;
    if (!tourRunsOnDate(tour, id, weekday)) continue;
    items.push({
      id: `tournee-${tour.id}-${id}`,
      tourId: tour.id,
      start: tour.startTime,
      duration: 0,
      kind: "tournee",
      title: tour.name,
      subtitle: `${tour.appointmentCount} rendez-vous`,
    });
  }

  items.sort((a, b) => a.start.localeCompare(b.start));

  return { items, count: items.length, isClosed: false };
}

function extractCity(location: string): string | null {
  if (!location || location === "Cabinet") return null;
  const lastSegment = location.split(",").pop()?.trim() ?? "";
  const city = lastSegment.replace(/^\d{5}\s*/, "").trim();
  return city || null;
}

const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const currencyFormatter = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

export type YearStats = {
  consultations: number;
  revenueLabel: string;
  tours: number;
  distanceKm: number;
  busiestMonth: string;
  avgDurationMinutes: number;
};

/**
 * Calcule les statistiques annuelles à partir des vrais rendez-vous et des
 * vraies tournées (en comptant chaque occurrence d'une tournée récurrente
 * sur l'année, comme dans le module Tournées).
 */
export function getYearStats(year: number, appointments: Appointment[], tours: Tour[]): YearStats {
  const relevant = appointments.filter((appointment) => appointment.date.startsWith(`${year}-`) && appointment.status !== "cancelled");
  const consultations = relevant.length;
  const revenue = relevant
    .filter((appointment) => appointment.status === "confirmed" || appointment.status === "completed")
    .reduce((sum, appointment) => sum + appointment.price, 0);
  const avgDurationMinutes = consultations > 0 ? Math.round(relevant.reduce((sum, appointment) => sum + appointment.duration, 0) / consultations) : 0;

  const perMonth = new Array(12).fill(0);
  for (const appointment of relevant) perMonth[Number(appointment.date.slice(5, 7)) - 1] += 1;
  const busiestIndex = perMonth.indexOf(Math.max(...perMonth));
  const busiestMonth = consultations > 0 ? monthNames[busiestIndex] : "-";

  const activeTours = tours.filter((tour) => tour.status === "Active");
  let tourOccurrences = 0;
  let distanceKm = 0;
  if (activeTours.length > 0) {
    for (let day = new Date(year, 0, 1, 12); day.getFullYear() === year; day.setDate(day.getDate() + 1)) {
      const id = dateId(day);
      const weekday = weekdayLabelFor(day);
      for (const tour of activeTours) {
        if (!tourRunsOnDate(tour, id, weekday)) continue;
        tourOccurrences += 1;
        // Approximation assumée : la distance réelle de la prochaine
        // occurrence sert de proxy pour chaque occurrence future de
        // l'année — les rendez-vous des semaines à venir n'existent pas
        // encore pour être calculés individuellement (refonte tournées,
        // phase 1.3 ; estimatedKm saisi à la main n'est plus lu nulle part).
        distanceKm += tour.estimatedDistanceKm ?? 0;
      }
    }
  }

  return {
    consultations,
    revenueLabel: currencyFormatter.format(revenue),
    tours: tourOccurrences,
    distanceKm: Math.round(distanceKm),
    busiestMonth,
    avgDurationMinutes,
  };
}

export function getTopZones(year: number, appointments: Appointment[], limit = 4): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const appointment of appointments) {
    if (!appointment.date.startsWith(`${year}-`) || appointment.status === "cancelled" || appointment.mode !== "home") continue;
    const city = extractCity(appointment.location);
    if (!city) continue;
    counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}

export function getTopSpecies(year: number, appointments: Appointment[], limit = 4): Array<{ name: string; count: number }> {
  const counts = new Map<string, number>();
  for (const appointment of appointments) {
    if (!appointment.date.startsWith(`${year}-`) || appointment.status === "cancelled") continue;
    const species = appointment.animalSpecies ?? "Autre";
    counts.set(species, (counts.get(species) ?? 0) + 1);
  }
  return Array.from(counts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, limit);
}
