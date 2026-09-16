"use client";

import { useEffect, useState } from "react";
import { AlertCircle, CheckCircle, Loader2 } from "lucide-react";
import { getOccupiedSlotsAction, type OccupiedInterval } from "@/lib/appointments-actions";
import { intervalsOverlap, minutesToTime, timeToMinutes } from "@/lib/booking-validation";

type Availability =
  | { state: "idle" }
  | { state: "checking" }
  | { state: "free" }
  | { state: "busy"; conflicts: OccupiedInterval[] }
  | { state: "unknown" };

const CHECK_DEBOUNCE_MS = 350;

/**
 * Témoin de disponibilité du créneau.
 *
 * Il répond à la question qu'on se pose au téléphone — « est-ce que 9 h est
 * libre ? » — avant d'avoir cliqué sur « Créer ». Il lit les créneaux
 * réellement occupés (getOccupiedSlotsAction, qui inclut le temps de trajet
 * des visites à domicile et les plages bloquées) et compare de vrais
 * intervalles, exactement comme hasConflict() côté serveur.
 *
 * C'est une aide, pas une autorisation : le refus d'un créneau occupé reste
 * décidé par le serveur au moment de l'enregistrement. Un témoin vert ne
 * garantit donc rien si quelqu'un réserve entre-temps — d'où le message
 * d'erreur du formulaire, qui reste la vérité.
 */
export function AppointmentAvailabilityIndicator({ date, start, duration, excludeId }: {
  date: string;
  start: string;
  duration: number;
  /** Rendez-vous en cours de modification : il ne peut pas entrer en conflit avec lui-même. */
  excludeId?: string;
}) {
  const [availability, setAvailability] = useState<Availability>({ state: "idle" });

  // Le créneau interrogé, sous forme de clé. Comparé pendant le rendu plutôt
  // que dans un effet : changer d'heure doit afficher « vérification… » tout
  // de suite, sans attendre un second rendu.
  const slotKey = date && start && duration ? `${date}|${start}|${duration}` : null;
  const [checkedSlot, setCheckedSlot] = useState<string | null>(null);
  if (checkedSlot !== slotKey) {
    setCheckedSlot(slotKey);
    setAvailability(slotKey === null ? { state: "idle" } : { state: "checking" });
  }

  useEffect(() => {
    if (!date || !start || !duration) return;

    let cancelled = false;

    const timeout = setTimeout(() => {
      getOccupiedSlotsAction(date, date)
        .then((slots) => {
          if (cancelled) return;
          const startMinutes = timeToMinutes(start);
          const sameDay = slots[date] ?? [];
          const conflicts = sameDay.filter((slot) => intervalsOverlap(startMinutes, duration, timeToMinutes(slot.start), slot.duration));

          // Le rendez-vous modifié figure dans les créneaux occupés : il ne
          // doit pas se signaler à lui-même comme un conflit.
          const relevant = excludeId
            ? conflicts.filter((slot) => !(slot.start === start && slot.duration === duration))
            : conflicts;

          setAvailability(relevant.length > 0 ? { state: "busy", conflicts: relevant } : { state: "free" });
        })
        .catch(() => {
          // Limite de débit ou réseau : on ne prétend pas que le créneau est
          // libre, on dit qu'on n'a pas pu vérifier.
          if (!cancelled) setAvailability({ state: "unknown" });
        });
    }, CHECK_DEBOUNCE_MS);

    return () => { cancelled = true; clearTimeout(timeout); };
  }, [date, start, duration, excludeId]);

  if (availability.state === "idle") return null;

  if (availability.state === "checking") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-animeo-bg px-3.5 py-2.5 text-sm font-bold text-animeo-muted">
        <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
        Vérification du créneau…
      </p>
    );
  }

  if (availability.state === "unknown") {
    return (
      <p className="flex items-center gap-2 rounded-xl bg-animeo-bg px-3.5 py-2.5 text-sm font-bold text-animeo-muted">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        Disponibilité non vérifiable pour le moment — elle sera contrôlée à l’enregistrement.
      </p>
    );
  }

  if (availability.state === "free") {
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl bg-animeo-positive-soft px-3.5 py-2.5 text-sm font-bold text-animeo-positive">
        <CheckCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        Créneau disponible
      </p>
    );
  }

  return (
    <div role="status" className="rounded-xl bg-animeo-danger-soft px-3.5 py-2.5 text-sm font-bold text-animeo-danger">
      <p className="flex items-center gap-2">
        <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
        Conflit avec un rendez-vous existant
      </p>
      <ul className="mt-1 space-y-0.5 pl-6 text-xs font-semibold">
        {availability.conflicts.map((slot) => (
          <li key={`${slot.start}-${slot.duration}`}>
            Déjà occupé de {slot.start} à {minutesToTime(timeToMinutes(slot.start) + slot.duration)}.
          </li>
        ))}
      </ul>
    </div>
  );
}
