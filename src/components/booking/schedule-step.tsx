"use client";

import { useEffect, useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import type { BookingDate, BookingMode, PublicService } from "@/data/public-booking";
import { getOccupiedSlotsAction, type OccupiedInterval } from "@/lib/appointments-actions";
import { getPublicScheduleAction } from "@/lib/public-schedule";
import { intervalsOverlap, timeToMinutes } from "@/lib/booking-validation";

type ScheduleStepProps = {
  mode: BookingMode;
  service: PublicService;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string | null) => void;
  onTimeChange: (time: string | null) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ScheduleStep({ mode, service, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const [bookingDates, setBookingDates] = useState<BookingDate[]>([]);
  const [loadingDates, setLoadingDates] = useState(true);
  const [occupiedSlots, setOccupiedSlots] = useState<Record<string, OccupiedInterval[]>>({});
  const [occupiedSlotsError, setOccupiedSlotsError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);

  // Générées depuis les vraies disponibilités du praticien (horaires,
  // vacances, fermetures exceptionnelles), sur une fenêtre glissante
  // J+1 → J+90 — voir src/lib/public-schedule.ts. Dépend de la durée de la
  // prestation : une prestation plus longue peut ne pas tenir dans un
  // créneau où une prestation plus courte tiendrait.
  useEffect(() => {
    let cancelled = false;
    // queueMicrotask : évite d'appeler setState de façon synchrone au corps
    // de l'effet (même convention que src/components/availability/manual-availability.ts).
    queueMicrotask(() => { if (!cancelled) setLoadingDates(true); });
    getPublicScheduleAction(mode === "CABINET" ? "cabinet" : "home", service.duration)
      .then((result) => { if (!cancelled) setBookingDates(result); })
      .catch(() => { if (!cancelled) setBookingDates([]); })
      .finally(() => { if (!cancelled) setLoadingDates(false); });
    return () => { cancelled = true; };
  }, [mode, service.duration]);

  // Recale le mois sélectionné dès que la liste de dates change (premier
  // chargement, ou changement de mode/prestation qui invalide le mois
  // précédemment sélectionné).
  useEffect(() => {
    if (bookingDates.length > 0 && !bookingDates.some((date) => date.id.startsWith(selectedMonth))) {
      const firstMonth = bookingDates[0].id.slice(0, 7);
      queueMicrotask(() => setSelectedMonth(firstMonth));
    }
  }, [bookingDates, selectedMonth]);

  useEffect(() => {
    if (bookingDates.length === 0) {
      queueMicrotask(() => { setOccupiedSlots({}); setOccupiedSlotsError(false); });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setOccupiedSlotsError(false); });
    getOccupiedSlotsAction(bookingDates[0].id, bookingDates[bookingDates.length - 1].id)
      .then((slots) => { if (!cancelled) setOccupiedSlots(slots); })
      .catch(() => {
        // En cas d'échec réseau, aucun créneau n'est masqué localement (la
        // vérification définitive reste faite côté serveur au moment de la
        // soumission, et re-vérifiée une dernière fois juste avant l'étape
        // suivante — voir submit), mais l'état dégradé est signalé
        // explicitement plutôt que masqué en silence.
        if (!cancelled) setOccupiedSlotsError(true);
      });
    return () => { cancelled = true; };
  }, [bookingDates]);

  const monthIds = [...new Set(bookingDates.map((date) => date.id.slice(0, 7)))];
  const visibleDates = bookingDates.filter((date) => date.id.startsWith(selectedMonth));
  const selectedDate = bookingDates.find((date) => date.id === dateId);
  // Un créneau n'est proposé que si [début, début+durée) ne recouvre aucun
  // intervalle déjà occupé — même règle que hasConflict() côté serveur
  // (src/lib/appointments-actions.ts), pas une simple égalité d'horaire de
  // départ : un soin de 60 min à 09:00 doit aussi retirer 09:30.
  const availableSlots = selectedDate
    ? selectedDate.slots.filter((slot) => {
        const slotStartMinutes = timeToMinutes(slot);
        return !(occupiedSlots[selectedDate.id] ?? []).some((occupied) =>
          intervalsOverlap(slotStartMinutes, service.duration, timeToMinutes(occupied.start), occupied.duration),
        );
      })
    : [];

  function selectDate(nextDateId: string) {
    setSelectedMonth(nextDateId.slice(0, 7));
    onDateChange(nextDateId);
    onTimeChange(null);
  }

  // Revérifie la disponibilité du créneau juste avant de passer à l'étape
  // suivante, plutôt que de laisser l'utilisateur remplir tout le
  // récapitulatif pour ne découvrir qu'à l'envoi final qu'il vient d'être
  // pris entre-temps (P1 "le créneau n'est pas réservé pendant la saisie" —
  // en l'absence d'un vrai verrou temporaire, revérifier à la transition
  // d'étape est le palliatif minimal explicitement accepté par l'audit).
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!dateId || !time || !selectedDate) return;
    setRevalidationError(null);
    setRevalidating(true);
    try {
      const freshOccupied = await getOccupiedSlotsAction(selectedDate.id, selectedDate.id);
      const stillFree = !(freshOccupied[selectedDate.id] ?? []).some((occupied) =>
        intervalsOverlap(timeToMinutes(time), service.duration, timeToMinutes(occupied.start), occupied.duration),
      );
      if (!stillFree) {
        setOccupiedSlots((current) => ({ ...current, [selectedDate.id]: freshOccupied[selectedDate.id] ?? [] }));
        onTimeChange(null);
        setRevalidationError("Ce créneau vient d'être réservé par quelqu'un d'autre. Choisissez un autre horaire.");
        return;
      }
      onNext();
    } catch {
      setRevalidationError("Impossible de vérifier ce créneau pour le moment. Réessayez.");
    } finally {
      setRevalidating(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 2 · Rendez-vous" title="Choisissez une date et une heure" />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      {bookingDates.length > 0 ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">1. Choisissez une date</p>
          <div className="mb-4 overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2" aria-label="Choisir le mois">
              {monthIds.map((monthId) => (
                <button
                  key={monthId}
                  type="button"
                  aria-pressed={selectedMonth === monthId}
                  onClick={() => { setSelectedMonth(monthId); onDateChange(null); onTimeChange(null); }}
                  className={`rounded-xl px-4 py-2.5 text-sm font-extrabold capitalize transition outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 ${selectedMonth === monthId ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-dark hover:bg-animeo-soft"}`}
                >
                  {formatMonth(monthId)}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
            {visibleDates.map((date) => {
              const isSelected = dateId === date.id;
              return (
                <button key={date.id} type="button" onClick={() => selectDate(date.id)} aria-pressed={isSelected} className={`min-h-24 rounded-2xl border-2 px-3 py-3 text-center transition outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 ${isSelected ? "border-animeo-dark bg-animeo-dark text-white" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
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
            {availableSlots.map((slot) => <button key={slot} type="button" onClick={() => onTimeChange(slot)} aria-pressed={time === slot} className={`min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 ${time === slot ? "border-animeo bg-animeo text-white" : "border-[#dfe9e6] text-animeo-dark hover:border-[#aad5cd]"}`}>{slot}</button>)}
          </div>
          <p className="mt-3 text-xs leading-5 text-animeo-muted">Les heures déjà occupées sont retirées : les rendez-vous au cabinet et à domicile partagent un seul agenda.</p>
          {occupiedSlotsError ? (
            <p role="alert" className="mt-3 rounded-2xl bg-[#fff7f0] p-3 text-xs font-bold leading-5 text-[#a85d32]">Impossible de vérifier les créneaux déjà pris — les horaires affichés pourraient ne pas être à jour. Une dernière vérification aura lieu avant de continuer.</p>
          ) : null}
        </div>
      ) : null}

      {loadingDates ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-bold text-animeo-muted">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-animeo/25 border-t-animeo" />
          Recherche des prochaines disponibilités…
        </p>
      ) : bookingDates.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Aucun créneau n’est disponible pour le moment. Revenez à l’étape précédente ou contactez directement le professionnel.</p>
      ) : null}
      {revalidationError ? <p role="alert" aria-live="polite" className="mt-5 rounded-2xl bg-[#fff1f1] p-3 text-sm font-bold text-[#a9573b]">{revalidationError}</p> : null}
      <BookingActions onBack={onBack} nextDisabled={!dateId || !time} loading={revalidating} />
    </form>
  );
}

function formatMonth(monthId: string) {
  const [year, month] = monthId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1, 12));
}
