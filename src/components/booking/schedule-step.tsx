"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import {
  bookingDates,
  bookingLimitDate,
  bookingStartDate,
  type BookingAddress,
  type BookingDate,
  type BookingMode,
  type PublicProfessional,
  type PublicService,
} from "@/data/public-booking";
import { publicBookingMapClients, publicBookingTourAppointments, publicBookingTours } from "@/data/public-booking-tours";
import { getOccupiedSlotsAction } from "@/lib/appointments-actions";
import type { Tour } from "@/data/tours";

function toDateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

type ScheduleStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  clientAddress: BookingAddress;
  zoneId: string | null;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

function normalizeLocation(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
}

function tourRunsOnDate(tour: Tour, date: BookingDate) {
  if (tour.day !== date.weekday) return false;
  if (!tour.dateId) return true;
  if (tour.recurrence === "Une seule fois") return tour.dateId === date.id;
  return date.id >= tour.dateId;
}

export function ScheduleStep({ professional, mode, service, clientAddress, zoneId, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const [occupiedSlots, setOccupiedSlots] = useState<Record<string, string[]>>({});
  // Mesure palliative en attendant la Phase 2 (génération des créneaux à
  // partir des vraies disponibilités, sur une fenêtre glissante) : bookingDates
  // est une liste figée qui ne tient pas compte de la date du jour, elle
  // proposerait sinon des dates déjà passées comme réservables.
  const todayId = toDateId(new Date());
  const futureBookingDates = bookingDates.filter((date) => date.id >= todayId);

  useEffect(() => {
    let cancelled = false;
    getOccupiedSlotsAction(toDateId(bookingStartDate), toDateId(bookingLimitDate))
      .then((slots) => { if (!cancelled) setOccupiedSlots(slots); })
      .catch(() => {
        // En cas d'échec réseau, aucun créneau n'est masqué : la vérification
        // définitive reste faite côté serveur au moment de la soumission.
      });
    return () => { cancelled = true; };
  }, []);

  const zone = professional.zones.find((item) => item.id === zoneId);
  const normalizedCity = normalizeLocation(clientAddress.city);
  const activeTours = mode === "HOME"
    ? publicBookingTours.filter((tour) => tour.zoneId === zoneId && tour.status === "Active")
    : [];
  const activeTourDays = new Set(activeTours.map((tour) => tour.day));
  const tourByDate = new Map<string, Tour>();
  if (mode === "HOME") {
    for (const date of futureBookingDates) {
      const matchingTour = activeTours.find((tour) => tourRunsOnDate(tour, date));
      if (matchingTour) tourByDate.set(date.id, matchingTour);
    }
  }
  /**
   * Les tournées ne sont qu'une suggestion : tous les créneaux libres de
   * l'agenda restent proposés, même hors zone de tournée. Seules les dates
   * qui correspondent à une tournée active sont mises en avant en tête de
   * liste (avec, en cas d'égalité, celles où un passage est déjà prévu dans
   * la même ville).
   */
  const dates = mode === "HOME"
    ? [...futureBookingDates].sort((firstDate, secondDate) => {
        const firstTour = tourByDate.get(firstDate.id);
        const secondTour = tourByDate.get(secondDate.id);
        if (Boolean(firstTour) !== Boolean(secondTour)) return firstTour ? -1 : 1;
        if (firstTour && secondTour) {
          const firstMatchesCity = (publicBookingTourAppointments[firstTour.id] ?? []).some((appointment) => normalizeLocation(appointment.city) === normalizedCity);
          const secondMatchesCity = (publicBookingTourAppointments[secondTour.id] ?? []).some((appointment) => normalizeLocation(appointment.city) === normalizedCity);
          if (firstMatchesCity !== secondMatchesCity) return firstMatchesCity ? -1 : 1;
        }
        return firstDate.id.localeCompare(secondDate.id);
      })
    : futureBookingDates;
  const monthIds = [...new Set(dates.map((date) => date.id.slice(0, 7)))];
  const [selectedMonth, setSelectedMonth] = useState(monthIds[0] ?? "");
  const visibleDates = dates.filter((date) => date.id.startsWith(selectedMonth));
  const selectedDate = dates.find((date) => date.id === dateId);
  const availableSlots = selectedDate?.slots.filter((slot) => !(occupiedSlots[selectedDate.id] ?? []).includes(slot)) ?? [];
  const recommendedDates = mode === "HOME" ? dates.filter((date) => tourByDate.has(date.id)).slice(0, 3) : [];
  const scheduledInCity = activeTours.flatMap((tour) => publicBookingTourAppointments[tour.id] ?? []).filter((appointment) => normalizeLocation(appointment.city) === normalizedCity).length;
  const mappedInCity = publicBookingMapClients.filter((client) => normalizeLocation(client.city) === normalizedCity).length;
  const nearbyLocationCount = scheduledInCity + mappedInCity;

  function selectDate(nextDateId: string) {
    setSelectedMonth(nextDateId.slice(0, 7));
    onDateChange(nextDateId);
    onTimeChange(null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (dateId && time) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading
        eyebrow="Étape 3 · Rendez-vous"
        title={mode === "HOME" ? "Les meilleurs créneaux pour votre secteur" : "Choisissez une date et une heure"}
      />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      {mode === "HOME" && zone && activeTours.length > 0 ? (
        <div className="mt-4 rounded-2xl border border-[#bfe1d8] bg-[#edf9f5] p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo text-lg font-black text-white">⌖</span>
            <div>
              <p className="font-black text-[#24755f]">{zone.name} détectée</p>
              <p className="mt-1 text-sm leading-6 text-animeo-dark">
                {activeTours.map((tour) => tour.name).join(", ")} · passage le{activeTourDays.size > 1 ? "s" : ""} {[...activeTourDays].join(" et ").toLocaleLowerCase("fr-FR")}. Ces jours sont mis en avant ci-dessous, mais tous les autres créneaux libres restent disponibles.
              </p>
              {nearbyLocationCount > 0 ? <p className="mt-2 text-sm font-extrabold text-animeo-dark">{nearbyLocationCount} passage{nearbyLocationCount > 1 ? "s" : ""} ou lieu{nearbyLocationCount > 1 ? "x" : ""} déjà identifié{nearbyLocationCount > 1 ? "s" : ""} à {clientAddress.city} : ces dates facilitent le regroupement des visites.</p> : null}
            </div>
          </div>
        </div>
      ) : null}

      {recommendedDates.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <p className="text-sm font-black text-animeo-dark">Dates recommandées</p>
              <p className="mt-1 text-xs text-animeo-muted">Les prochains passages dans votre secteur.</p>
            </div>
            <span className="rounded-full bg-animeo-soft px-3 py-1 text-xs font-black text-animeo">Trajet optimisé</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {recommendedDates.map((date) => (
              <button key={date.id} type="button" onClick={() => selectDate(date.id)} aria-pressed={dateId === date.id} className={`rounded-2xl border-2 p-4 text-left text-white shadow-[0_8px_22px_rgba(79,175,159,0.2)] transition ${dateId === date.id ? "border-animeo-dark bg-animeo-dark" : "border-animeo bg-animeo hover:border-animeo-dark hover:bg-animeo-dark"}`}>
                <span className="block text-xs font-extrabold uppercase tracking-wide text-white/75">Tournée correspondante</span>
                <span className="mt-1 block text-lg font-black capitalize">{date.weekday} {date.shortLabel}</span>
                <span className="mt-2 block text-xs font-bold text-white/80">{tourByDate.get(date.id)?.name} · {nearbyLocationCount > 0 ? `regroupement à ${clientAddress.city}` : zone?.name}</span>
                <span className="mt-3 inline-flex rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-black">Réserver ce jour</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {dates.length > 0 ? (
        <div className="mt-6">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-black text-animeo-dark">1. Choisissez une date</p>
            {mode === "HOME" ? <span className="inline-flex items-center gap-2 text-xs font-extrabold text-animeo-muted"><span className="h-3 w-3 rounded-full bg-animeo" /> Tournée correspondant à votre secteur</span> : null}
          </div>
          <div className="mb-4 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2" aria-label="Choisir le mois">
              {monthIds.map((monthId) => (
                <button
                  key={monthId}
                  type="button"
                  aria-pressed={selectedMonth === monthId}
                  onClick={() => { setSelectedMonth(monthId); onDateChange(null); onTimeChange(null); }}
                  className={`rounded-xl px-4 py-2.5 text-sm font-extrabold capitalize transition ${selectedMonth === monthId ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"}`}
                >
                  {formatMonth(monthId)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {visibleDates.map((date) => {
              const matchingTour = tourByDate.get(date.id);
              const isSelected = dateId === date.id;
              return (
                <button key={date.id} type="button" onClick={() => selectDate(date.id)} aria-pressed={isSelected} className={`min-h-24 rounded-2xl border-2 px-3 py-3 text-center transition ${isSelected ? "border-animeo-dark bg-animeo-dark text-white" : matchingTour ? "border-animeo bg-animeo-soft hover:bg-[#d8f1ea]" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
                  {matchingTour ? <span className={`mb-1 block text-[10px] font-black uppercase tracking-wide ${isSelected ? "text-white/75" : "text-animeo"}`}>Tournée secteur</span> : null}
                  <span className={`block text-xs font-extrabold uppercase ${isSelected ? "text-white/75" : "text-animeo-muted"}`}>{date.weekday}</span>
                  <span className={`mt-1 block font-black ${isSelected ? "text-white" : "text-animeo-dark"}`}>{date.shortLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

      {selectedDate ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">2. Choisissez une heure</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {availableSlots.map((slot) => <button key={slot} type="button" onClick={() => onTimeChange(slot)} aria-pressed={time === slot} className={`min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition ${time === slot ? "border-animeo bg-animeo text-white" : "border-[#dfe9e6] text-animeo-dark hover:border-[#aad5cd]"}`}>{slot}</button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-animeo-muted">Les heures déjà occupées sont retirées : les rendez-vous au cabinet et à domicile partagent un seul agenda.</p>
        </div>
      ) : null}

      {dates.length === 0 ? <p className="mt-5 rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Aucun créneau n’est disponible pour le moment. Revenez à l’étape précédente ou contactez directement le professionnel.</p> : null}
      <BookingActions onBack={onBack} nextDisabled={!dateId || !time} />
    </form>
  );
}

function formatMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1, 12));
}
