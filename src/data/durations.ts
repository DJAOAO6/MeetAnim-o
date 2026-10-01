/**
 * Durées de rendez-vous proposées partout (onboarding, Paramètres,
 * prestations, formulaire de rendez-vous) : une seule liste, pour que la
 * même durée existe à chaque endroit. 50 min : la séance la plus courante
 * chez les ostéopathes animaliers.
 */
export const APPOINTMENT_DURATION_PRESETS = [30, 45, 50, 60, 75, 90, 120] as const;

/**
 * La liste, plus la valeur courante si elle n'y figure pas (triée) : un
 * rendez-vous de 40 min s'affiche « 40 minutes », jamais « 30 minutes »
 * faute d'option correspondante.
 */
export function durationOptions(current?: number | null): number[] {
  const values = new Set<number>(APPOINTMENT_DURATION_PRESETS);
  if (current && current > 0) values.add(current);
  return [...values].sort((first, second) => first - second);
}
