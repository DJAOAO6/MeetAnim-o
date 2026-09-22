/**
 * Cloisonnement des requêtes par espace professionnel (multi-comptes,
 * phase 2).
 *
 * Le principe : ne jamais compter sur la vigilance. Plutôt que d'ajouter à
 * la main un filtre à chacune des ~900 requêtes de l'application — où il
 * suffit d'en oublier une pour qu'un professionnel voie les clients d'un
 * autre —, la restriction est posée une fois, ici, et appliquée à toutes.
 *
 * Ce fichier ne parle pas à la base : il ne fait que réécrire les arguments
 * d'une requête. C'est du calcul pur, donc vérifiable directement par des
 * tests (voir tests-unit/db-scope.test.ts), sans base de données.
 *
 * Deux règles, et une interdiction :
 * - toute lecture est restreinte à l'espace courant ;
 * - toute création reçoit l'espace courant ;
 * - **déplacer** une donnée d'un espace à un autre est refusé : c'est
 *   toujours une erreur de programmation, jamais une intention.
 */

/**
 * Modèles dont chaque ligne appartient à un espace professionnel.
 *
 * Absents volontairement :
 * - `Organization` elle-même ;
 * - les tables rattachées à un compte (`Session`, `PasswordResetToken`,
 *   `TwoFactorCode`, `CalendarConnection`, `TourPreferences`,
 *   `DashboardPreferences`) : elles suivent leur utilisateur, qui appartient
 *   déjà à un espace ;
 * - `RateLimitEvent`, qui protège l'application entière, pas un cabinet ;
 * - `User`, `StudioDocumentTemplate` et `AuditLog`, dont la colonne existe
 *   mais peut être vide : un compte de plateforme n'a pas d'espace, les
 *   modèles fournis avec 1002 Pattes sont communs à tous les cabinets. Leur
 *   cloisonnement est explicite, dans le code qui les manipule.
 *
 * Le test `tests-unit/db-scope.test.ts` relit prisma/schema.prisma et vérifie
 * que cette liste correspond bien aux tables qui portent la colonne.
 */
export const TENANT_MODELS = new Set([
  "BusinessProfile",
  "Client",
  "Animal",
  "Consultation",
  "AnimalDocument",
  "StudioDocument",
  "Appointment",
  "AppointmentCalendarEvent",
  "BlockedSlot",
  "Reminder",
  "Zone",
  "City",
  "Tour",
  "Service",
  "TourRun",
  "TourStop",
  "SavedPlace",
  "ClientImport",
]);

/**
 * Opérations qui désignent une ligne par une clé unique. Prisma n'y accepte
 * pas de `AND` : la restriction s'y ajoute comme une clé de plus, ce qui
 * revient au même — Prisma combine les clés d'un `where` par « et ».
 */
const UNIQUE_WHERE = new Set(["findUnique", "findUniqueOrThrow", "update", "delete", "upsert"]);

/** Opérations dont le `where` accepte des conditions libres. */
const FILTER_WHERE = new Set([
  "findFirst", "findFirstOrThrow", "findMany",
  "updateMany", "updateManyAndReturn", "deleteMany",
  "count", "aggregate", "groupBy",
]);

/** Opérations qui créent des lignes, et doivent donc porter l'espace. */
const CREATING = new Set(["create", "createMany", "createManyAndReturn", "upsert"]);

type Args = Record<string, unknown> | undefined;

/**
 * Un `where` restreint à l'espace, sans écraser les conditions existantes.
 *
 * `AND` plutôt qu'une fusion de clés : un `where` peut déjà contenir un
 * `OR`, et y ajouter une clé au même niveau l'élargirait au lieu de le
 * restreindre — exactement la fuite qu'on cherche à rendre impossible.
 */
export function scopeWhere(where: unknown, organizationId: string): Record<string, unknown> {
  if (!where || Object.keys(where as object).length === 0) return { organizationId };
  return { AND: [where as Record<string, unknown>, { organizationId }] };
}

/** Données de création, avec l'espace posé. Accepte une ligne ou un tableau. */
export function scopeCreateData(data: unknown, organizationId: string): unknown {
  if (Array.isArray(data)) return data.map((row) => ({ ...(row as object), organizationId }));
  return { ...(data as object), organizationId };
}

/**
 * Refuse toute tentative de changer l'espace d'une donnée existante. Un
 * client, un rendez-vous ou une tournée ne change pas de cabinet : si le code
 * le demande, c'est qu'il se trompe, et le laisser passer mélangerait les
 * données de deux professionnels.
 */
function refuseOrganizationChange(data: unknown, model: string): void {
  if (!data || typeof data !== "object") return;
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    if (row && typeof row === "object" && "organizationId" in row) {
      throw new Error(`Changer l'espace professionnel d'une ligne ${model} est interdit.`);
    }
  }
}

/**
 * Les arguments d'une requête, restreints à l'espace courant.
 *
 * Les écritures imbriquées (`data: { animals: { create: … } }`) ne sont pas
 * réécrites : l'application n'en fait aucune sur une table cloisonnée, et
 * deviner la table visée à travers une relation serait fragile. À la fin de
 * cette phase, la base cessera de poser un espace par défaut : une écriture
 * imbriquée oubliée échouera alors franchement, au lieu d'attribuer
 * silencieusement la donnée au premier cabinet.
 */
export function scopeArgs(model: string, operation: string, args: Args, organizationId: string): Args {
  if (!TENANT_MODELS.has(model)) return args;
  const next: Record<string, unknown> = { ...(args ?? {}) };

  if (UNIQUE_WHERE.has(operation)) {
    next.where = { ...(next.where as object | undefined), organizationId };
  } else if (FILTER_WHERE.has(operation)) {
    next.where = scopeWhere(next.where, organizationId);
  }

  if (operation === "update" || operation === "updateMany" || operation === "updateManyAndReturn") {
    refuseOrganizationChange(next.data, model);
  }

  if (CREATING.has(operation)) {
    if (operation === "upsert") {
      refuseOrganizationChange(next.update, model);
      next.create = scopeCreateData(next.create, organizationId);
    } else {
      next.data = scopeCreateData(next.data, organizationId);
    }
  }

  return next;
}
