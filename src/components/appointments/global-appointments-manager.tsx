"use client";

import { useState } from "react";
import { AppointmentModal, type AppointmentModalContext } from "@/components/appointments/appointment-modal";
import { AppointmentsManagerModal } from "@/components/appointments/appointments-manager-modal";
import { useAppointments } from "@/components/appointments/appointments-context";
import { notify } from "@/lib/notify";
import type { Appointment, AppointmentStatus } from "@/data/appointments";

/**
 * Point d'entrée des deux fenêtres de rendez-vous, monté une seule fois pour
 * tout l'espace professionnel (voir le layout) : les boutons flottants et
 * l'agenda les ouvrent depuis n'importe quelle page, sans la quitter.
 *
 * L'ancienne version affichait un tiroir venu de la droite, qui contenait à
 * la fois la liste, la fiche et le formulaire — d'où une navigation en
 * profondeur (« retour à la fiche », « tous les rendez-vous ») pour un
 * travail qui tient sur un seul écran. Ici, deux fenêtres centrées avec
 * chacune son rôle : gérer, ou créer.
 */
export function GlobalAppointmentsManager({ context }: { context: AppointmentModalContext }) {
  const {
    appointments,
    managerOpen,
    selectedAppointmentId,
    creatingAppointment,
    newAppointmentDefaultDate,
    newAppointmentPrefill,
    openManager,
    openNewAppointment,
    closeManager,
    saveAppointment,
    updateAppointmentStatus,
  } = useAppointments();

  // Rendez-vous ouvert en modification, distinct de la sélection dans la
  // liste : on peut consulter une fiche sans entrer en édition, et c'est
  // voulu — un champ ne doit pas pouvoir changer par mégarde pendant qu'on
  // lit.
  const [editing, setEditing] = useState<Appointment | null>(null);
  // Modèle d'un rendez-vous dupliqué : le formulaire s'ouvre pré-rempli mais
  // sans identifiant, donc en création.
  const [duplicating, setDuplicating] = useState<Appointment | null>(null);

  async function handleStatusChange(appointment: Appointment, status: AppointmentStatus) {
    const result = await updateAppointmentStatus(appointment.id, status);
    if (!result.ok) { notify.error(result.error ?? "Une erreur est survenue."); return; }

    if (status === "cancelled") notify.success("Rendez-vous annulé — le créneau est de nouveau libre.");
    else if (status === "confirmed") notify.success("Rendez-vous confirmé");
    else notify.success("Rendez-vous marqué comme terminé");
  }

  if (!managerOpen) return null;

  // Création : demandée explicitement, ou en modification d'un rendez-vous,
  // ou duplication d'un rendez-vous existant.
  if (creatingAppointment || editing || duplicating) {
    const appointment = editing ?? undefined;

    return (
      <AppointmentModal
        // La clé force un formulaire neuf quand on passe d'un rendez-vous à
        // un autre : sans elle, le brouillon du précédent resterait en place.
        key={appointment?.id ?? (duplicating ? `copy-${duplicating.id}` : "new")}
        appointment={appointment}
        template={duplicating ?? undefined}
        defaultDate={newAppointmentDefaultDate}
        prefill={duplicating || editing ? undefined : newAppointmentPrefill}
        context={context}
        onSave={saveAppointment}
        onClose={() => {
          if (editing || duplicating) {
            // Retour à la liste plutôt que fermeture complète : on y était
            // juste avant, et on y retourne souvent après.
            setEditing(null);
            setDuplicating(null);
            openManager(editing?.id);
            return;
          }
          closeManager();
        }}
        onCreated={() => { setEditing(null); setDuplicating(null); }}
      />
    );
  }

  return (
    <AppointmentsManagerModal
      appointments={appointments}
      initialSelectedId={selectedAppointmentId}
      onClose={closeManager}
      onCreate={() => openNewAppointment()}
      onEdit={(appointment) => setEditing(appointment)}
      onDuplicate={(appointment) => setDuplicating(appointment)}
      onStatusChange={handleStatusChange}
    />
  );
}
