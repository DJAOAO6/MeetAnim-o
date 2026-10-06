/**
 * Archivage des clients (chantier C5) : règles pures, partagées par la fiche,
 * la liste et les tests. Archiver sort une fiche de la liste courante, de la
 * recherche, du sélecteur de rendez-vous, de la carte et des relances — sans
 * rien supprimer ni annuler.
 */

export type UpcomingAppointments = { name: string; count: number };

export const MAX_ARCHIVE_BATCH = 500;

/**
 * La question posée avant d'archiver. Les rendez-vous à venir sont annoncés
 * nommément : ils ne sont pas annulés, et le professionnel doit le savoir.
 */
export function archiveConfirmationMessage(clientCount: number, singleName: string | null, upcoming: UpcomingAppointments[]): string {
  const subject = clientCount === 1 && singleName ? `la fiche de ${singleName}` : `ces ${clientCount} fiches clients`;
  const lines = [`Archiver ${subject} ? ${clientCount === 1 ? "Elle sortira" : "Elles sortiront"} de la liste, de la recherche et des relances, sans être ${clientCount === 1 ? "supprimée" : "supprimées"}.`];
  const withAppointments = upcoming.filter((entry) => entry.count > 0);
  if (withAppointments.length > 0) {
    lines.push("");
    for (const entry of withAppointments) lines.push(`${entry.name} a ${entry.count} rendez-vous à venir.`);
    const total = withAppointments.reduce((sum, entry) => sum + entry.count, 0);
    lines.push(total > 1 ? "Ils sont conservés." : "Il est conservé.");
  }
  return lines.join("\n");
}

/** « Client archivé le 6 octobre 2026 ». */
export function archivedOnLabel(archivedAt: string | Date): string {
  return `Client archivé le ${new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(new Date(archivedAt))}`;
}
