import type { ReminderSettings } from "@/data/settings";

/**
 * Phrase décrivant le rappel qui sera réellement envoyé avant un rendez-vous.
 *
 * Le formulaire de rendez-vous affiche cette phrase plutôt que des cases à
 * cocher : le rappel automatique est un réglage du cabinet
 * (ReminderSettings.appointmentReminderEnabled), pas une option par
 * rendez-vous. Des cases ici donneraient l'illusion d'un choix qui n'est
 * stocké nulle part — et qu'on croirait fait.
 */
export function describeReminderSetting(settings: ReminderSettings): string {
  if (!settings.appointmentReminderEnabled) {
    return "Aucun rappel automatique n’est envoyé avant les rendez-vous.";
  }
  return `Un rappel par e-mail est envoyé automatiquement ${settings.appointmentReminderDelay.toLocaleLowerCase("fr-FR")}.`;
}
