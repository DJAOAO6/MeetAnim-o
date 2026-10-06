import type { ScopedPrismaClient } from "@/lib/db";

/**
 * Réaliser un rendez-vous (chantier C7) : le même cœur pour le bouton
 * « Consultation réalisée », le statut choisi dans le formulaire et la tâche
 * planifiée. Sans session : l'appelant passe l'espace (client cloisonné) —
 * ce qui permet aussi de l'éprouver sur une base en mémoire.
 *
 * Seul un rendez-vous confirmé se réalise ; une demande en attente doit
 * d'abord être acceptée, un rendez-vous annulé ne l'est jamais.
 *
 * La consultation créée porte l'identifiant du rendez-vous (unique) : la
 * réaliser deux fois — double clic, deux passages de la tâche — n'en crée
 * jamais une seconde.
 */

/** Une transaction du client cloisonné (ou le client lui-même) : seules ces deux tables servent. */
type Tx = Pick<ScopedPrismaClient, "appointment" | "consultation">;

/** Crée la consultation du rendez-vous s'il n'en a pas encore (et s'il est rattaché à un animal). */
export async function ensureConsultation(tx: Tx, appointmentId: string): Promise<void> {
  const appointment = await tx.appointment.findUnique({ where: { id: appointmentId }, select: { animalId: true, date: true, serviceName: true, mode: true, price: true } });
  if (!appointment?.animalId) return;
  await tx.consultation.upsert({
    where: { appointmentId },
    create: { appointmentId, animalId: appointment.animalId, date: appointment.date, service: appointment.serviceName, mode: appointment.mode, price: appointment.price, summary: "" },
    update: {},
  });
}

/**
 * Défait une réalisation : la consultation créée par le rendez-vous est
 * retirée, et sa date de réalisation effacée. Le statut suivant (annulé le
 * plus souvent : client absent) est posé par l'appelant.
 */
export async function undoCompletion(tx: Tx, appointmentId: string): Promise<boolean> {
  const { count } = await tx.consultation.deleteMany({ where: { appointmentId } });
  await tx.appointment.update({ where: { id: appointmentId }, data: { completedAt: null } });
  return count > 0;
}

/** Dans une transaction en cours : vrai si c'est cet appel qui l'a réalisé. */
export async function completeInTransaction(tx: Tx, appointmentId: string, completedAt: Date): Promise<boolean> {
  // Conditionnel : deux appels simultanés, un seul passe.
  const { count } = await tx.appointment.updateMany({ where: { id: appointmentId, status: "CONFIRMED" }, data: { status: "COMPLETED", completedAt } });
  if (count === 0) return false;
  await ensureConsultation(tx, appointmentId);
  return true;
}

/**
 * Réalise un rendez-vous confirmé, consultation comprise. Ne fait rien (et
 * renvoie faux) s'il est déjà réalisé, annulé ou encore en attente.
 */
export async function markAppointmentCompleted(db: ScopedPrismaClient, appointmentId: string, options: { completedAt?: Date } = {}): Promise<boolean> {
  return db.$transaction((tx) => completeInTransaction(tx, appointmentId, options.completedAt ?? new Date()));
}
