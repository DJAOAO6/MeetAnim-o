"use client";

import { MAX_SLOT_CHOICES, MIN_SLOT_CHOICES, choiceRankLabel, toggleSlotChoice, type SlotChoice } from "@/lib/slot-requests";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { CalendarMonth, type CalendarDayStatus } from "@/components/booking/calendar-month";
import type { BookingDate, BookingMode, PublicService } from "@/data/public-booking";
import { getOccupiedSlotsAction, type OccupiedSlots } from "@/lib/appointments-actions";
import { getPublicScheduleAction } from "@/lib/public-schedule";
import { formatBookingDateLabels, groupSlotsByPeriod, isSlotFree, timeToMinutes } from "@/lib/booking-validation";
import { Button } from "@/components/ui/button";
import { Calendar, Clock } from "lucide-react";

type ScheduleStepProps = {
  /** Lien public du cabinet : c'est lui qui désigne de quel agenda il s'agit. */
  slug: string;
  mode: BookingMode;
  service: PublicService;
  dateId: string | null;
  time: string | null;
  onDateChange: (dateId: string | null) => void;
  onTimeChange: (time: string | null) => void;
  /**
   * Jours de passage de la tournée qui dessert le secteur du visiteur, tels
   * que « Mardi ». Vide quand aucun secteur n'est connu, ou qu'aucune
   * tournée ne le dessert : le calendrier ne marque alors rien du tout.
   */
  tourWeekdays?: string[];
  /** Nom du secteur, pour dire de quoi on parle sous le calendrier. */
  tourZoneName?: string | null;
  onBack: () => void;
  onNext: () => void;
  /**
   * Plusieurs horaires (chantier C8) : proposé si le cabinet le permet.
   * `choices` : les horaires retenus, par ordre de préférence.
   */
  allowMultiple?: boolean;
  multiple?: boolean;
  choices?: SlotChoice[];
  onMultipleChange?: (multiple: boolean) => void;
  onChoicesChange?: (choices: SlotChoice[]) => void;
};

const periodLabels = { morning: "Matin", afternoon: "Après-midi" } as const;
const NO_OCCUPIED_SLOTS: OccupiedSlots = { buffers: { travelBuffer: 0, breakAfterAppointment: 0 }, byDate: {} };

export function ScheduleStep({ slug, mode, service, dateId, time, onDateChange, onTimeChange, tourWeekdays = [], tourZoneName, onBack, onNext, allowMultiple = false, multiple = false, choices = [], onMultipleChange, onChoicesChange }: ScheduleStepProps) {
  const isChosen = (slot: string) => Boolean(dateId) && choices.some((choice) => choice.date === dateId && choice.time === slot);
  const choicesFull = choices.length >= MAX_SLOT_CHOICES;

  function pickSlot(slot: string) {
    if (!multiple) { onTimeChange(slot); return; }
    if (!dateId) return;
    onChoicesChange?.(toggleSlotChoice(choices, { date: dateId, time: slot }).choices);
  }

  // Comparaison insensible à la casse : le jour d'un motif de tournée est
  // saisi côté professionnel, le libellé d'une date est produit par Intl.
  const tourWeekdaySet = new Set(tourWeekdays.map((day) => day.toLocaleLowerCase("fr-FR")));
  const showsTourDays = tourWeekdaySet.size > 0;

  function isTourDay(candidateId: string): boolean {
    return tourWeekdaySet.has(formatBookingDateLabels(candidateId).weekday.toLocaleLowerCase("fr-FR"));
  }

  const [bookingDates, setBookingDates] = useState<BookingDate[]>([]);
  const [windowStartId, setWindowStartId] = useState<string | null>(null);
  const [windowEndId, setWindowEndId] = useState<string | null>(null);
  const [loadingDates, setLoadingDates] = useState(true);
  const [occupiedSlots, setOccupiedSlots] = useState<OccupiedSlots>(NO_OCCUPIED_SLOTS);
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
    getPublicScheduleAction(slug, mode === "CABINET" ? "cabinet" : "home", service.duration)
      .then((result) => {
        if (cancelled) return;
        setBookingDates(result.dates);
        setWindowStartId(result.windowStartId);
        setWindowEndId(result.windowEndId);
      })
      .catch(() => { if (!cancelled) setBookingDates([]); })
      .finally(() => { if (!cancelled) setLoadingDates(false); });
    return () => { cancelled = true; };
  }, [slug, mode, service.duration]);

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
      queueMicrotask(() => { setOccupiedSlots(NO_OCCUPIED_SLOTS); setOccupiedSlotsError(false); });
      return;
    }
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setOccupiedSlotsError(false); });
    getOccupiedSlotsAction(slug, bookingDates[0].id, bookingDates[bookingDates.length - 1].id)
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
  }, [slug, bookingDates]);

  /** Le rendez-vous que ce créneau deviendrait. */
  function candidateAt(slot: string) {
    return { start: timeToMinutes(slot), duration: service.duration, mode };
  }

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
    const occupied = occupiedSlots.byDate[candidateDateId] ?? [];
    const isFull = date.slots.every((slot) => !isSlotFree(candidateAt(slot), occupied, occupiedSlots.buffers));
    return isFull ? "full" : "available";
  }

  // Un créneau n'est proposé que s'il ne heurte aucun intervalle déjà occupé
  // — même règle que hasConflict() côté serveur (isSlotFree) : un soin de
  // 60 min à 09:00 retire aussi 09:30, et le trajet et la pause comptent
  // après chaque rendez-vous, le nouveau compris.
  const availableSlots = selectedDate
    ? selectedDate.slots.filter((slot) => isSlotFree(candidateAt(slot), occupiedSlots.byDate[selectedDate.id] ?? [], occupiedSlots.buffers))
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
    if (multiple) { await submitChoices(); return; }
    if (!dateId || !time || !selectedDate) return;
    setRevalidationError(null);
    setRevalidating(true);
    try {
      const freshOccupied = await getOccupiedSlotsAction(slug, selectedDate.id, selectedDate.id);
      const stillFree = isSlotFree(candidateAt(time), freshOccupied.byDate[selectedDate.id] ?? [], freshOccupied.buffers);
      if (!stillFree) {
        setOccupiedSlots((current) => ({ buffers: freshOccupied.buffers, byDate: { ...current.byDate, [selectedDate.id]: freshOccupied.byDate[selectedDate.id] ?? [] } }));
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

  /**
   * Plusieurs horaires : chacun est revérifié ; celui qui vient d'être pris
   * est retiré de la liste, avec un message, pour en choisir un autre.
   */
  async function submitChoices() {
    if (choices.length < MIN_SLOT_CHOICES) return;
    setRevalidationError(null);
    setRevalidating(true);
    try {
      const dates = choices.map((choice) => choice.date).sort();
      const fresh = await getOccupiedSlotsAction(slug, dates[0], dates[dates.length - 1]);
      const taken = choices.filter((choice) => !isSlotFree(candidateAt(choice.time), fresh.byDate[choice.date] ?? [], fresh.buffers));
      if (taken.length > 0) {
        setOccupiedSlots((current) => ({ buffers: fresh.buffers, byDate: { ...current.byDate, ...fresh.byDate } }));
        onChoicesChange?.(choices.filter((choice) => !taken.includes(choice)));
        setRevalidationError(`${taken.map((choice) => `L’horaire du ${formatBookingDateLabels(choice.date).fullLabel.toLocaleLowerCase("fr-FR")} à ${choice.time}`).join(" et ")} vient d’être réservé : retiré de vos choix. Choisissez-en un autre.`);
        return;
      }
      onNext();
    } catch {
      setRevalidationError("Impossible de vérifier ces créneaux pour le moment. Réessayez.");
    } finally {
      setRevalidating(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 2 · Rendez-vous" title="Choisissez votre créneau" />
      <div className="rounded-2xl bg-animeo-soft p-4 text-sm text-animeo-dark"><strong>{service.name}</strong> · {service.duration} minutes · {mode === "CABINET" ? "Au cabinet" : "À domicile"}</div>

      {occupiedSlotsError ? (
        <p role="alert" className="mt-4 rounded-2xl bg-animeo-warning-soft p-3 text-xs font-bold leading-5 text-animeo-warning">Impossible de vérifier les créneaux déjà pris — les jours affichés comme disponibles pourraient en réalité être complets. Une dernière vérification aura lieu avant de continuer.</p>
      ) : null}

      {loadingDates ? (
        <p className="mt-5 flex items-center gap-2 text-sm font-bold text-animeo-muted">
          <span aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-animeo/25 border-t-animeo" />
          Recherche des prochaines disponibilités…
        </p>
      ) : bookingDates.length === 0 ? (
        <p className="mt-5 rounded-2xl bg-animeo-warning-soft p-4 text-sm font-bold text-animeo-warning">Aucun créneau n’est disponible pour le moment. Revenez à l’étape précédente ou contactez directement le professionnel.</p>
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
              isTourDay={showsTourDays ? isTourDay : undefined}
            />

            {allowMultiple ? (
              <label className="mt-4 flex cursor-pointer items-start gap-3 rounded-2xl border border-animeo-border p-3.5">
                <input
                  type="checkbox"
                  checked={multiple}
                  onChange={(event) => onMultipleChange?.(event.target.checked)}
                  aria-describedby="schedule-multiple-help"
                  className="mt-0.5 h-5 w-5 shrink-0 accent-animeo-brand"
                />
                <span>
                  <span className="block text-sm font-extrabold text-animeo-dark">Je suis disponible à plusieurs horaires</span>
                  <span id="schedule-multiple-help" className="mt-0.5 block text-xs leading-5 text-animeo-muted">Choisissez jusqu’à 3 horaires, par ordre de préférence. Le professionnel retiendra celui qui lui convient.</span>
                </span>
              </label>
            ) : null}

            {/* Légende : un repère sans légende laisse deviner. Affichée
                seulement quand il y a quelque chose à expliquer. */}
            {showsTourDays ? (
              <p className="mt-3 flex items-start gap-2 rounded-xl bg-animeo-positive-soft/60 px-3 py-2.5 text-xs leading-5 text-animeo-dark">
                <span aria-hidden="true" className="mt-1.5 block h-1.5 w-1.5 shrink-0 rounded-full bg-animeo-positive" />
                <span>
                  Ces jours-là, nous passons déjà {tourZoneName ? <>dans le secteur <strong className="font-extrabold">{tourZoneName}</strong></> : "dans votre secteur"}.
                  C’est plus simple à organiser, mais vous restez libre de choisir une autre date.
                </span>
              </p>
            ) : null}
          </div>

          {selectedDate ? (
            <div ref={timeSectionRef} className="scroll-mt-6">
              <p className="mb-3 text-sm font-black text-animeo-dark">2. Choisissez une heure</p>
              <div className="mb-4 flex items-center gap-2 rounded-2xl bg-animeo-bg px-4 py-3 text-sm font-extrabold text-animeo-dark">
                <Calendar aria-hidden="true" className="h-4 w-4 shrink-0" />
                {formatBookingDateLabels(selectedDate.id).fullLabel}
              </div>

              {periodGroups.length === 0 ? (
                <p className="rounded-2xl bg-animeo-warning-soft p-4 text-sm font-bold text-animeo-warning">Plus aucun créneau disponible ce jour-là. Choisissez une autre date.</p>
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
                              onClick={() => pickSlot(slot)}
                              aria-pressed={multiple ? isChosen(slot) : time === slot}
                              // Trois horaires choisis : les autres attendent qu'on en retire un.
                              disabled={multiple && choicesFull && !isChosen(slot)}
                              className={`touch-manipulation min-h-12 rounded-2xl border-2 px-4 py-3 font-black transition outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 ${(multiple ? isChosen(slot) : time === slot) ? "border-animeo-dark bg-animeo-dark text-white" : "border-animeo-border text-animeo-dark hover:border-animeo-border-strong"}`}
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
                <Clock aria-hidden="true" className="h-3.5 w-3.5 shrink-0" />
                Seuls les créneaux disponibles sont affichés.
              </p>
            </div>
          ) : (
            <div className="hidden min-h-40 items-center justify-center rounded-2xl border border-dashed border-animeo-border p-6 text-center text-sm font-bold text-animeo-muted lg:flex">
              Choisissez d’abord une date
            </div>
          )}
        </div>
      ) : null}

      {multiple ? (
        <section aria-label="Vos horaires" className="mt-6 rounded-2xl border border-animeo-border bg-animeo-bg p-4">
          <p className="text-sm font-black text-animeo-dark">Vos horaires</p>
          {choices.length === 0 ? (
            <p className="mt-1 text-sm text-animeo-muted">Choisissez un jour puis une heure : elle s’ajoute ici. Vous pouvez changer de jour entre deux choix.</p>
          ) : (
            <ol className="mt-2 grid gap-2">
              {choices.map((choice, index) => {
                const label = `${formatBookingDateLabels(choice.date).fullLabel} à ${choice.time}`;
                return (
                  <li key={`${choice.date}-${choice.time}`} className="flex items-center justify-between gap-3 rounded-xl bg-white px-3 py-2">
                    <span className="text-sm text-animeo-dark"><strong className="font-extrabold">{choiceRankLabel(index + 1)}</strong> · {label}</span>
                    <Button type="button" variant="danger" onClick={() => onChoicesChange?.(choices.filter((_, position) => position !== index))} aria-label={`Retirer le ${choiceRankLabel(index + 1)} : ${label}`} className="shrink-0">Retirer</Button>
                  </li>
                );
              })}
            </ol>
          )}
          {/* Trois horaires : les autres créneaux sont désactivés, et on dit pourquoi. */}
          {choicesFull ? <p role="status" className="mt-2 text-xs font-bold text-animeo-warning">Vous avez choisi 3 horaires : retirez-en un pour en choisir un autre.</p> : null}
          {choices.length < MIN_SLOT_CHOICES ? <p className="mt-2 text-xs text-animeo-muted">Choisissez au moins 2 horaires — ou décochez la case pour n’en réserver qu’un.</p> : null}
        </section>
      ) : null}

      {revalidationError ? <p role="alert" aria-live="polite" className="mt-5 rounded-2xl bg-animeo-danger-soft p-3 text-sm font-bold text-animeo-danger">{revalidationError}</p> : null}
      <div ref={actionsRef} className="scroll-mt-6">
        <BookingActions onBack={onBack} nextDisabled={multiple ? choices.length < MIN_SLOT_CHOICES : !dateId || !time} loading={revalidating} />
      </div>
    </form>
  );
}

