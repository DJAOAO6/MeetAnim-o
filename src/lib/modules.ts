/**
 * Modules d'un espace professionnel : ce que la plateforme lui ouvre en plus
 * du socle.
 *
 * Le socle est toujours là — tableau de bord, agenda, réservation en ligne,
 * clients et animaux, prestations, réglages de base, rappel automatique de
 * rendez-vous. Le reste s'active espace par espace, depuis la
 * super-administration, et seulement de là : un espace ne s'ouvre pas un
 * module lui-même.
 *
 * Un module désactivé est fermé **côté serveur** (pages, actions, adresses
 * d'API, tâches de fond), pas seulement retiré du menu. Ses données restent
 * en place : le réactiver rend tout.
 */

export const MODULE_KEYS = ["TOURS", "REMINDERS", "DOCUMENTS", "STATISTICS", "CALENDAR_SYNC", "CLIENT_IMPORT", "TEAM", "PUBLIC_PAGE"] as const;

export type ModuleKey = (typeof MODULE_KEYS)[number];

export const MODULES: Record<ModuleKey, { label: string; description: string }> = {
  TOURS: { label: "Tournées et carte", description: "Tournées, zones, itinéraires, carte des clients, propositions de tournée sur la page de réservation." },
  REMINDERS: { label: "Rappels clients", description: "Relances après consultation (« revoir dans 6 mois ») et leur suivi." },
  DOCUMENTS: { label: "Comptes rendus", description: "Documents et Studio : comptes rendus, modèles, schémas anatomiques." },
  STATISTICS: { label: "Statistiques", description: "Chiffre d’affaires et activité détaillée." },
  CALENDAR_SYNC: { label: "Agendas externes", description: "Google Agenda, abonnement Apple Calendar et Outlook." },
  CLIENT_IMPORT: { label: "Import de clients", description: "Import d’une clientèle existante depuis un fichier." },
  TEAM: { label: "Équipe", description: "Plusieurs comptes dans l’espace : secrétariat, remplaçant, associé." },
  PUBLIC_PAGE: { label: "Page publique personnalisée", description: "Éditeur de la page de réservation : sections, thème, présentation détaillée." },
};

export function isModuleKey(value: string): value is ModuleKey {
  return (MODULE_KEYS as readonly string[]).includes(value);
}

/** Les modules connus, dans l'ordre de référence, sans doublon. */
export function normalizeModules(values: readonly string[]): ModuleKey[] {
  return MODULE_KEYS.filter((key) => values.includes(key));
}

export function hasModule(modules: readonly string[] | null | undefined, key: ModuleKey): boolean {
  return Boolean(modules?.includes(key));
}

/** Le message montré quand on atteint un module fermé. */
export function moduleClosedMessage(key: ModuleKey): string {
  return `« ${MODULES[key].label} » n’est pas activé pour votre espace. Contactez l’équipe 1002 Pattes pour en bénéficier.`;
}
