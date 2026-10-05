import { z } from "zod";
import { searchPeople, type SearchablePerson } from "@/lib/fuzzy-match";

/**
 * Logique pure de la recherche unifiée (clients/animaux) : séparée de
 * src/lib/clients-actions.ts ("use server") pour rester testable
 * unitairement — un fichier "use server" ne peut exporter que des fonctions
 * async (même contrainte que booking-validation.ts).
 */

export const clientSearchQuerySchema = z.string().trim().min(2).max(100);

export const MAX_SEARCH_RESULTS_PER_GROUP = 5;

/**
 * Le classement de la recherche côté serveur (carte, tournées) : le même
 * que celui de l'en-tête (src/lib/fuzzy-match.ts), pour qu'une même saisie
 * trouve la même chose partout. Sans groupe « Vous cherchiez peut-être »
 * dans ces écrans, les résultats approchants suivent les franches.
 */
export function rankClientsAndAnimals<C extends SearchablePerson>(query: string, people: C[]) {
  const result = searchPeople(query, people, { limit: MAX_SEARCH_RESULTS_PER_GROUP });
  return {
    clients: [...result.clients, ...result.approximate.clients].slice(0, MAX_SEARCH_RESULTS_PER_GROUP),
    animals: [...result.animals, ...result.approximate.animals].slice(0, MAX_SEARCH_RESULTS_PER_GROUP),
  };
}
