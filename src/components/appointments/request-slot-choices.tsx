"use client";

import { useEffect, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Button } from "@/components/ui/button";
import { getRequestOptionsAction, type RequestOptionState } from "@/lib/appointments-actions";
import { choiceRankLabel, expiryNotice } from "@/lib/slot-requests";
import { notify } from "@/lib/notify";
import type { Appointment } from "@/data/appointments";

/**
 * Demande à plusieurs horaires (chantier C8) : ceux que le client propose,
 * par ordre de préférence, chacun avec « Retenir cet horaire ». Il n'y a pas
 * de bouton « Accepter » pour ces demandes : il ne dirait pas lequel.
 *
 * Chaque horaire est revérifié à l'affichage (pris depuis, passé, hors des
 * horaires du cabinet) ; le serveur revérifie de toute façon au moment de
 * retenir.
 */

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const STATE_NOTES: Record<RequestOptionState, string | null> = {
  available: null,
  taken: "Pris depuis par un autre rendez-vous",
  past: "Horaire passé",
  "outside-hours": "Hors de vos horaires",
};

/** La demande propose-t-elle plusieurs horaires ? */
export function hasSlotOptions(appointment: Pick<Appointment, "status" | "slotOptions">): boolean {
  return appointment.status === "pending" && (appointment.slotOptions?.length ?? 0) > 1;
}

/**
 * « expire dans 5 h » : dans ses dernières 24 h, une demande à plusieurs
 * horaires dit quand elle expire ; rien avant. L'heure est relue chaque
 * minute (jamais pendant le rendu) : un écran resté ouvert reste juste.
 */
export function useExpiryNotice(appointment: Pick<Appointment, "expiresAt">): string | null {
  const [now, setNow] = useState(() => new Date());
  const expiresAt = appointment.expiresAt;
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, [expiresAt]);
  return expiresAt ? expiryNotice(new Date(expiresAt), now) : null;
}

export const EXPIRY_HINT = "Sans réponse, la demande est annulée et ses horaires se libèrent";

export function RequestExpiryBadge({ appointment, className = "" }: { appointment: Pick<Appointment, "expiresAt">; className?: string }) {
  const expiry = useExpiryNotice(appointment);
  if (!expiry) return null;
  return <span className={`whitespace-nowrap rounded-full bg-animeo-danger-soft px-2 py-0.5 text-xs font-extrabold normal-case tracking-normal text-animeo-danger ${className}`} title={EXPIRY_HINT}>{expiry}</span>;
}

export function RequestSlotChoices({ appointment, onConfirmed, compact = false }: { appointment: Appointment; onConfirmed?: () => void; compact?: boolean }) {
  const { confirmRequestSlot } = useAppointments();
  const [states, setStates] = useState<Record<string, RequestOptionState>>({});
  const [pendingId, setPendingId] = useState<string | null>(null);
  const options = appointment.slotOptions ?? [];

  useEffect(() => {
    let cancelled = false;
    getRequestOptionsAction(appointment.id)
      .then((rows) => { if (!cancelled) setStates(Object.fromEntries(rows.map((row) => [row.id, row.state]))); })
      .catch(() => { /* Sans vérification préalable, le serveur tranchera au clic. */ });
    return () => { cancelled = true; };
  }, [appointment.id]);

  async function retain(optionId: string, label: string) {
    setPendingId(optionId);
    const result = await confirmRequestSlot(appointment.id, optionId);
    setPendingId(null);
    if (!result.ok) {
      notify.error(result.error ?? "Une erreur est survenue.");
      // L'état des horaires a pu changer : on le relit.
      getRequestOptionsAction(appointment.id).then((rows) => setStates(Object.fromEntries(rows.map((row) => [row.id, row.state])))).catch(() => {});
      return;
    }
    notify.success(`Rendez-vous de ${appointment.animalName} confirmé : ${label}. Les autres horaires sont de nouveau libres.`);
    onConfirmed?.();
  }

  if (options.length === 0) return null;
  // Un seul bouton plein par demande : le premier choix du client. Les
  // autres horaires restent à un clic, en secondaire.
  const preferredRank = Math.min(...options.map((option) => option.rank));

  return (
    <section aria-label={`Horaires proposés pour ${appointment.animalName}`} className={compact ? "" : "rounded-2xl border border-animeo-warning-border bg-animeo-warning-soft/60 p-3"}>
      <p className="flex flex-wrap items-center gap-2 text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">
        {options.length} horaires proposés — retenez-en un
        <RequestExpiryBadge appointment={appointment} />
      </p>
      <ol className="mt-2 grid gap-2">
        {options.map((option) => {
          const day = dateFormatter.format(new Date(`${option.date}T12:00:00`));
          const label = `${day.charAt(0).toLocaleUpperCase("fr-FR")}${day.slice(1)} à ${option.start}`;
          const state = states[option.id] ?? "available";
          const blocked = state === "taken" || state === "past";
          return (
            <li key={option.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-white px-3 py-2">
              <span className="min-w-0 text-sm text-animeo-dark">
                <strong className="font-extrabold">{choiceRankLabel(option.rank)}</strong> · {label}
                {STATE_NOTES[state] ? <span className={`mt-0.5 block text-xs font-bold ${blocked ? "text-animeo-danger" : "text-animeo-warning"}`}>{STATE_NOTES[state]}</span> : null}
              </span>
              <Button type="button" variant={option.rank === preferredRank ? "primary" : "secondary"} onClick={() => retain(option.id, label)} disabled={blocked || pendingId !== null} aria-label={`Retenir le ${choiceRankLabel(option.rank)} : ${label}`} className="shrink-0">
                {pendingId === option.id ? "Confirmation…" : "Retenir cet horaire"}
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
