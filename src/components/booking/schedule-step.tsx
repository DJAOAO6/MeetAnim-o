"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { CalendarMonth, type CalendarDayStatus } from "@/components/booking/calendar-month";
import type { BookingDate, BookingMode, PublicService } from "@/data/public-booking";
import { getOccupiedSlotsAction, type OccupiedInterval } from "@/lib/appointments-actions";
import { getPublicScheduleAction } from "@/lib/public-schedule";
import { formatBookingDateLabels, groupSlotsByPeriod, intervalsOverlap, timeToMinutes } from "@/lib/booking-validation";

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

const periodLabels = { morning: "Matin", afternoon: "Après-midi" } as const;

export function ScheduleStep({ mode, service, dateId, time, onDateChange, onTimeChange, onBack, onNext }: ScheduleStepProps) {
  const [bookingDates, setBookingDates] = useState<BookingDate[]>([]);
  const [windowStartId, setWindowStartId] = useState<string | null>(null);
  const [windowEndId, setWindowEndId] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(true);
  const [occupiedSlots, setOccupiedSlots] = useState<Record<string, OccupiedInterval[]>>({});
  const [occupiedSlotsError, setOccupiedSlotsError] = useState(false);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const timeSectionRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const skipNextDateScroll = useRef(true);
  const skipNextActionsScroll = useRef(true);

  // Même principe que ConsultationStep : amène la section "heure" à l'écran
  // dès qu'une date est choisie (surtout utile en une seule colonne sur
  // mobile, où le choix de l'heure apparaît sous le calendrier plutôt qu'à
  // côté), puis amène "Continuer" une fois l'heure choisie — jamais au
  // premier rendu/restauration d'une session en cours.
  useEffect(() => {
    if (skipNextDateScroll.current) {
      skipNextDateScroll.current = false;
      return;
    }
    if (dateId) timeSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [dateId]);

  useEffect(() => {
    if (skipNextActionsScroll.current) {
      skipNextActionsScroll.current = false;
      return;
    }
    if (dateId && time) actionsRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [dateId, time]);

  // Générées depuis les vraies disponibilités du praticien (horaires,
  // vacances, fermetures exceptionnelles), sur une fenêtre glissante
  // J+1 → J+90 — voir src/lib/public-schedule.ts. Dépend de la durée de la
  // prestation : une prestation plus longue peut ne pas tenir dans un
  // créneau où une prestation plus courte tiendrait.
  useEffect(() => {
    let cancelled = false;
    // queueMicrotask : évite d'appeler setState de façon synchrone au corps
    // de l'effet (même convention que src/components/clients/client-profile.tsx).
    queueMicrotask(() => { if (!cancelled) setLoadingDates(true); });
    getPublicScheduleAction(mode === "CABINET" ? "cabinet" : "home", service.duration)
      .then((result) => {
        if (cancelled) return;
        setBookingDates(result.dates);
        setWindowStartId(result.windowStartId);
        setWindowEndId(result.windowEndId);
      })
      .catch(() => { if (!cancelled) setBookingDates([]); })
      .finally(() => { if (!cancelled) setLoadingDates(false); });
    return () => { cancelled = true; };
  }, [mode, service.duration]);

  // Recale le mois affiché dès que la fenêtre change (premier chargement, ou
  // changement de mode/prestation) : le mois de départ de la fenêtre plutôt
  // que le premier jour AVEC créneaux — le calendrier doit pouvoir afficher
  // un mois entièrement fermé sans sauter dessus.
  useEffect(() => {
    if (windowStartId) {
      const startMonth = windowStartId.slice(0, 7);
      queueMicrotask(() => setSelectedMonth((current) => (current && current >= startMonth && (!windowEndId || current <= windowEndId.slice(0, 7)) ? current : startMonth)));
    }
  }, [windowStartId, windowEndId]);

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
        // En cas d'échec réseau, aucune date n'est marquée "complet" à tort
        // (voir statusFor) — la vérification définitive reste faite côté
        // serveur au moment de la soumission, et re-vérifiée une dernière
        // fois juste avant l'étape suivante (voir submit) — mais l'état
        // dégradé est signalé explicitement plutôt que masqué en silence.
        if (!cancelled) setOccupiedSlotsError(true);
      });
    return () => { cancelled = true; };
  }, [bookingDates]);

  const bookingDatesById = new Map(bookingDates.map((date) => [date.id, date]));
  const selectedDate = dateId ? bookingDatesById.get(dateId) : undefined;

  /**
   * État d'une cellule du calendrier — voir PROMPT-CALENDRIER.md §A2. Le
   * calendrier a besoin de tous les jours du mois, y compris ceux sans
   * créneau (fermés) ou hors fenêtre, pas seulement les jours présents dans
   * `bookingDates` (qui n'inclut que les jours avec au moins un créneau).
   */
  function statusFor(candidateDateId: string): CalendarDayStatus {
    if (!windowStartId || !windowEndId || candidateDateId < windowStartId || candidateDateId > windowEndId) return "outside-window";
    const date = bookingDatesById.get(candidateDateId);
    if (!date) return "closed";
    if (occupiedSlotsError) return "available";
    const occupied = occupiedSlots[candidateDateId] ?? [];
    const isFull = date.slots.every((slot) =>
      occupied.some((interval) => intervalsOverlap(timeToMinutes(slot), service.duration, timeToMinutes(interval.start), interval.duration)),
    );
    return isFull ? "full" : "available";
  }

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
  const groupedSlots = groupSlotsByPeriod(availableSlots);
  const periodGroups = (["morning", "afternoon"] as const).filter((period) => groupedSlots[period].length > 0);

  function selectDate(nextDateId: string) {
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
      <StepHeading eyebrow="Étape 2 · Rendez-vous" title="Choisissez votre créneau" />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      {occupiedSlotsError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-[#fff7f0] p-3 text-xs font-bold leading-5 text-[#a85d32]">Impossible de vérifier les créneaux déjà pris — les jours affichés comme disponibles pourraient en réalité être complets. Une dernière vérification aura lieu avant de continuer.</p>
      ) : null}

      {loadingDates ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-bold text-animeo-muted">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-animeo/25 border-t-animeo" />
          Recherche des prochaines disponibilités…
        </p>
      ) : bookingDates.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Aucun créneau n’est disponible pour le moment. Revenez à l’étape précédente ou contactez directement le professionnel.</p>
      ) : selectedMonth && windowStartId && windowEndId ? (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-sm font-black text-animeo-dark">1. Choisissez une date</p>
            <CalendarMonth
              monthId={selectedMonth}
              onMonthChange={setSelectedMonth}
              minMonthId={windowStartId.slice(0, 7)}
              maxMonthId={windowEndId.slice(0, 7)}
              selectedDateId={dateId}
              onSelectDate={selectDate}
              statusFor={statusFor}
            />
          </div>

          {selectedDate ? (
            <div ref={timeSectionRef} className="scroll-mt-6">
              <p className="mb-3 text-sm font-black text-animeo-dark">2. Choisissez une heure</p>
              <div className="mb-4 flex items-center gap-2 rounded-2xl bg-animeo-bg px-4 py-3 text-sm font-extrabold text-animeo-dark">
                <CalendarIcon />
                {formatBookingDateLabels(selectedDate.id).fullLabel}
              </div>

              {periodGroups.length === 0 ? (
                <p className="rounded-2xl bg-[#fff7f0] p-4 text-sm font-bold text-[#a85d32]">Plus aucun créneau disponible ce jour-là. Choisissez une autre date.</p>
              ) : (
                <div className="space-y-5">
                  {periodGroups.map((period) => {
                    const groupHeadingId = `schedule-period-${period}`;
                    return (
                      <div key={period} role="group" aria-labelledby={groupHeadingId}>
                        <p id={groupHeadingId} className="mb-2 text-xs font-extrabold uppercase tracking-wide text-animeo-muted">{periodLabels[period]}</p>
                        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                          {groupedSlots[period].map((slot) => (
                            <button
                              key={slot}
                              type="button"
                              onClick={() => onTimeChange(slot)}
                              aria-pressed={time === slot}
                              className={`touch-manipulation min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 ${time === slot ? "border-animeo-dark bg-animeo-dark text-white" : "border-[#dfe9e6] text-animeo-dark hover:border-[#aad5cd]"}`}
                            >
                              {slot}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <p className="mt-4 flex items-center gap-1.5 text-xs leading-5 text-animeo-muted">
                <ClockIcon />
                Seuls les créneaux disponibles sont affichés.
              </p>
            </div>
          ) : (
            <div className="hidden min-h-40 items-center justify-center rounded-2xl border border-dashed border-[#dfe9e6] p-6 text-center text-sm font-bold text-animeo-muted lg:flex">
              Choisissez d’abord une date
            </div>
          )}
        </div>
      ) : null}

      {revalidationError ? <p role="alert" aria-live="polite" className="mt-5 rounded-2xl bg-[#fff1f1] p-3 text-sm font-bold text-[#a9573b]">{revalidationError}</p> : null}
      <div ref={actionsRef} className="scroll-mt-6">
        <BookingActions onBack={onBack} nextDisabled={!dateId || !time} loading={revalidating} />
      </div>
    </form>
  );
}

function CalendarIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}
