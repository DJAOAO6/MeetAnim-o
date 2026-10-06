import { parisWallTimeToDate } from "@/lib/paris-time";

/**
 * « Consultation réalisée » automatique (chantier C7) : règles pures. Les
 * heures sont celles du praticien (Europe/Paris), jamais l'UTC implicite.
 */

/** Fin d'un rendez-vous : son heure de début à Paris, plus sa durée (un rendez-vous peut finir après minuit). */
export function appointmentEndsAt(appointment: { date: string; start: string; duration: number }): Date {
  return new Date(parisWallTimeToDate(appointment.date, appointment.start).getTime() + appointment.duration * 60 * 1000);
}

/**
 * Ce rendez-vous se réalise-t-il automatiquement à ce passage ? Il doit être
 * fini, et avoir fini après la mise en service de l'automatisme (`since`) :
 * l'historique d'avant n'est jamais rebasculé d'un coup (une consultation
 * peut déjà avoir été saisie à la main pour lui).
 */
export function shouldAutoComplete(appointment: { date: string; start: string; duration: number }, since: Date, now: Date): boolean {
  const end = appointmentEndsAt(appointment).getTime();
  return end > since.getTime() && end <= now.getTime();
}
