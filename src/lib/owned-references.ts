import "server-only";

import { organizationIdOf, type ScopedPrismaClient } from "@/lib/db";

/**
 * Identifiants reçus du navigateur, à enregistrer comme liens. La clé
 * étrangère vérifie qu'une ligne existe, pas qu'elle est du même cabinet :
 * un rendez-vous ou un document pouvait pointer vers le client d'un autre
 * professionnel (audit 2026-10, SEC-10). Chacun est donc relu par le client
 * cloisonné avant l'écriture, comme le font déjà relances, lieux et zones.
 */
export type ReferenceIds = {
  clientId?: string | null;
  animalId?: string | null;
  appointmentId?: string | null;
};

/** Message d'erreur si l'un des identifiants n'est pas de cet espace (ou si l'animal n'est pas de ce client), sinon null. */
export async function foreignReferenceError(db: ScopedPrismaClient, refs: ReferenceIds): Promise<string | null> {
  const [client, animal, appointment] = await Promise.all([
    refs.clientId ? db.client.findUnique({ where: { id: refs.clientId }, select: { id: true } }) : null,
    refs.animalId ? db.animal.findUnique({ where: { id: refs.animalId }, select: { clientId: true } }) : null,
    refs.appointmentId ? db.appointment.findUnique({ where: { id: refs.appointmentId }, select: { id: true } }) : null,
  ]);
  if (refs.clientId && !client) return "Client introuvable.";
  if (refs.animalId && !animal) return "Animal introuvable.";
  if (refs.appointmentId && !appointment) return "Rendez-vous introuvable.";
  if (refs.clientId && animal && animal.clientId !== refs.clientId) return "Cet animal n’appartient pas à ce client.";
  return null;
}

/**
 * Modèles de document visibles par un espace : ceux fournis avec 1002 Pattes
 * (sans espace) et les siens. La table n'est pas cloisonnée par la première
 * barrière (db-scope.ts) : ce filtre doit accompagner chaque lecture.
 */
export function visibleTemplatesWhere(db: ScopedPrismaClient) {
  return { OR: [{ organizationId: null }, { organizationId: organizationIdOf(db) }] };
}
