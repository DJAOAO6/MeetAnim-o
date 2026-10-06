/**
 * Visites multi-animaux (chantier C6) : règles pures, partagées par le
 * serveur, les e-mails et l'agenda. Une visite = plusieurs rendez-vous
 * (un par animal), enchaînés chez un même client, reliés par visitGroupId.
 */

export const MAX_VISIT_ANIMALS = 8;

/** « Mirsa », « Mirsa et Pacha », « Mirsa, Pacha et Luna ». */
export function frenchList(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/**
 * Regroupe des rendez-vous par visite, dans l'ordre des heures : un
 * rendez-vous seul forme sa propre visite.
 */
export function groupByVisit<T extends { id: string; start: string; visitGroupId?: string | null }>(appointments: T[]): T[][] {
  const groups = new Map<string, T[]>();
  for (const appointment of [...appointments].sort((a, b) => a.start.localeCompare(b.start))) {
    const key = appointment.visitGroupId ? `visit:${appointment.visitGroupId}` : `single:${appointment.id}`;
    const list = groups.get(key);
    if (list) list.push(appointment);
    else groups.set(key, [appointment]);
  }
  return [...groups.values()];
}

type VisitMember = { id: string; start: string; duration: number; animalName: string; serviceName: string; visitGroupId?: string | null };

/**
 * Une visite vue comme un seul rendez-vous, pour un e-mail : l'heure du
 * premier, la durée jusqu'à la fin du dernier, les animaux listés, et la
 * prestation de chacun avec son heure.
 */
export function visitSummary<M extends VisitMember>(members: M[]): { id: string; start: string; duration: number; animalName: string; serviceName: string; animalCount: number } {
  const ordered = [...members].sort((a, b) => a.start.localeCompare(b.start));
  const first = ordered[0];
  if (ordered.length === 1) return { id: first.id, start: first.start, duration: first.duration, animalName: first.animalName, serviceName: first.serviceName, animalCount: 1 };
  const last = ordered[ordered.length - 1];
  const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));
  return {
    id: first.visitGroupId ?? first.id,
    start: first.start,
    duration: minutes(last.start) + last.duration - minutes(first.start),
    animalName: frenchList(ordered.map((member) => member.animalName)),
    serviceName: ordered.map((member) => `${member.serviceName} pour ${member.animalName} à ${member.start}`).join(", "),
    animalCount: ordered.length,
  };
}
