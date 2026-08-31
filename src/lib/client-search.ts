import { z } from "zod";

/**
 * Logique pure de la recherche unifiée (clients/animaux) : séparée de
 * src/lib/clients-actions.ts ("use server") pour rester testable
 * unitairement — un fichier "use server" ne peut exporter que des fonctions
 * async (même contrainte que booking-validation.ts).
 */

export const clientSearchQuerySchema = z.string().trim().min(2).max(100);

export const MAX_SEARCH_RESULTS_PER_GROUP = 5;

type InsensitiveContains = { contains: string; mode: "insensitive" };
export type ClientNameWordCondition = { OR: [
  { firstName: InsensitiveContains },
  { lastName: InsensitiveContains },
  { phone: InsensitiveContains },
  { city: InsensitiveContains },
] };

/**
 * Un mot doit correspondre à au moins un des champs cherchés (ET entre les
 * mots) : permet de retrouver "prénom nom" saisi dans n'importe quel ordre
 * sans concaténer les colonnes en SQL brut — juste des conditions Prisma
 * standard, qui se traduisent en ILIKE côté Postgres (mode: "insensitive").
 */
export function buildClientNameWordConditions(query: string): ClientNameWordCondition[] {
  const words = query.split(/\s+/).filter(Boolean);
  return words.map((word) => ({
    OR: [
      { firstName: { contains: word, mode: "insensitive" as const } },
      { lastName: { contains: word, mode: "insensitive" as const } },
      { phone: { contains: word, mode: "insensitive" as const } },
      { city: { contains: word, mode: "insensitive" as const } },
    ],
  }));
}
