"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { completeAppointmentAction, type SuggestedReminder } from "@/lib/appointments-actions";
import { createDocumentAction, getDocumentIdForAppointment, getDocumentTemplates } from "@/lib/documents-actions";
import { pickDefaultTemplate } from "@/lib/documents/templates";
import { saveReminderAction } from "@/lib/reminders-actions";
import { notify } from "@/lib/notify";
import type { Appointment } from "@/data/appointments";

/**
 * Les deux actions de fin de consultation, partagées par la fiche de
 * l'agenda (AppointmentSummary) et par celle du centre de gestion
 * (AppointmentDetailsPanel).
 *
 * Elles sont ici pour une raison précise : « Consultation réalisée » n'est
 * pas un simple changement de statut. completeAppointmentAction crée aussi la
 * consultation dans le dossier de l'animal et propose un rappel à la bonne
 * échéance. Les recopier dans un second écran aurait donné deux versions
 * d'un même geste, dont une aurait fini par diverger.
 */
export function useAppointmentActions(onDone: () => void) {
  const router = useRouter();
  const [completing, setCompleting] = useState(false);
  const [creatingDocument, setCreatingDocument] = useState(false);
  // Le rendez-vous est retenu avec la proposition : le rappel porte son nom
  // de client, et la fenêtre peut avoir changé de sélection entre-temps.
  const [reminderPrompt, setReminderPrompt] = useState<{ suggestion: SuggestedReminder; appointment: Appointment } | null>(null);

  async function complete(appointment: Appointment) {
    if (completing) return;
    setCompleting(true);
    const result = await completeAppointmentAction(appointment.id);
    setCompleting(false);
    if (!result.ok) { notify.error(result.error); return; }

    notify.success("Consultation marquée comme réalisée.");
    // Le rappel se propose avant de refermer : c'est le seul moment où l'on
    // sait quelle prestation vient d'être faite, donc à quelle échéance
    // reproposer un rendez-vous.
    if (result.suggestedReminder) { setReminderPrompt({ suggestion: result.suggestedReminder, appointment }); return; }
    router.refresh();
    onDone();
  }

  /**
   * Rouvre le compte rendu existant s'il y en a déjà un pour ce rendez-vous
   * (contrainte unique sur appointmentId) plutôt que d'échouer sur une
   * seconde création — l'espèce de l'animal choisit le modèle le plus adapté
   * s'il en existe un.
   */
  async function createDocument(appointment: Appointment) {
    if (creatingDocument) return;
    setCreatingDocument(true);
    const existingId = await getDocumentIdForAppointment(appointment.id);
    if (existingId) { router.push(`/dashboard/documents/${existingId}`); return; }

    const templates = await getDocumentTemplates();
    const template = pickDefaultTemplate(appointment.animalSpecies ?? null, templates);
    const result = await createDocumentAction({
      title: `Compte rendu — ${appointment.animalName}`,
      clientId: appointment.clientId,
      animalId: appointment.animalId,
      appointmentId: appointment.id,
      templateId: template?.id,
    });
    setCreatingDocument(false);
    if (!result.ok) { notify.error(result.error); return; }
    router.push(`/dashboard/documents/${result.id}`);
  }

  async function confirmReminder() {
    if (!reminderPrompt) return;
    const { clientId, animalId, delay, dueDate } = reminderPrompt.suggestion;
    setReminderPrompt(null);
    const result = await saveReminderAction({ clientId, animalId, dueDate, delay, note: "" });
    if (!result.ok) notify.error(result.error);
    else notify.success(`Rappel programmé dans ${delay}.`);
    router.refresh();
    onDone();
  }

  function declineReminder() {
    setReminderPrompt(null);
    router.refresh();
    onDone();
  }

  const reminderDialog = reminderPrompt ? (
    <ConfirmModal
      title="Programmer un rappel ?"
      message={`Proposer un nouveau rendez-vous à ${reminderPrompt.appointment.clientName} dans ${reminderPrompt.suggestion.delay}, à partir de la prestation d'aujourd'hui.`}
      confirmLabel={`Programmer dans ${reminderPrompt.suggestion.delay}`}
      cancelLabel="Non merci"
      destructive={false}
      onConfirm={confirmReminder}
      onClose={declineReminder}
    />
  ) : null;

  return { complete, completing, createDocument, creatingDocument, reminderDialog };
}
