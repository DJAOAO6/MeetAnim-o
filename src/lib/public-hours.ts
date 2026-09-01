import type { AvailabilitySettings } from "@/data/settings";

export type PublicHoursRow = { label: string; hours: string | null };

/**
 * Formate les disponibilités du praticien (AvailabilitySettings.days —
 * façonnées pour le calcul de créneaux réservables, pas pour l'affichage)
 * en lignes "Horaires" lisibles pour la page publique. `hours: null` = jour
 * fermé (aucun créneau actif, cabinet ou domicile). Un jour à créneaux
 * discontinus (pause déjeuner) affiche plusieurs plages séparées par une
 * virgule plutôt que la plus grande étendue, pour ne jamais laisser croire
 * à une continuité qui n'existe pas.
 */
export function formatPublicOpeningHours(availability: AvailabilitySettings): PublicHoursRow[] {
  return availability.days.map((day) => {
    if (!day.enabled || day.slots.length === 0) return { label: day.label, hours: null };
    const ranges = [...day.slots]
      .sort((a, b) => a.start.localeCompare(b.start))
      .map((slot) => `${slot.start} – ${slot.end}`);
    return { label: day.label, hours: ranges.join(", ") };
  });
}
