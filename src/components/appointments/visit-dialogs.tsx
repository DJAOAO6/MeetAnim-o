"use client";

import { useModalFocusTrap } from "@/components/ui/use-modal-focus-trap";
import { OverlayPortal } from "@/components/ui/overlay-portal";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { useAppointments } from "@/components/appointments/appointments-context";
import { frenchList } from "@/lib/visit-group";
import { notify } from "@/lib/notify";
import type { Appointment } from "@/data/appointments";

/**
 * Visites multi-animaux dans l'agenda (chantier C6) : les rendez-vous d'une
 * même visite se déplacent et s'annulent ensemble par défaut, ou un seul,
 * qui quitte alors la visite.
 */

/** Les rendez-vous de la visite de ce rendez-vous (lui compris), dans l'ordre ; vide s'il est seul. */
export function useVisitMembers(appointment: Pick<Appointment, "id" | "visitGroupId" | "date"> | null | undefined): Appointment[] {
  const { appointments } = useAppointments();
  if (!appointment?.visitGroupId) return [];
  const members = appointments
    .filter((item) => item.visitGroupId === appointment.visitGroupId && item.date === appointment.date && item.status !== "cancelled")
    .sort((a, b) => a.start.localeCompare(b.start));
  return members.length > 1 ? members : [];
}

type Choice = { label: string; onSelect: () => void; tone?: "primary" | "danger" | "neutral" };

/** Une question à plusieurs réponses (ConfirmModal n'en a que deux). La première est le choix par défaut. */
export function ChoiceModal({ title, message, choices, cancelLabel = "Annuler", onClose }: { title: string; message: string; choices: Choice[]; cancelLabel?: string; onClose: () => void }) {
  const dialogRef = useModalFocusTrap<HTMLElement>(onClose);
  const tones = {
    primary: "bg-animeo text-white hover:bg-animeo-hover",
    danger: "bg-animeo-error text-white hover:brightness-90",
    neutral: "border border-animeo-border text-animeo-dark hover:bg-animeo-bg",
  };
  return (
    <OverlayPortal>
      <div className="fixed inset-0 z-[75] flex items-center justify-center bg-animeo-deep/60 p-4 backdrop-blur-sm" role="presentation">
        <section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="choice-dialog-title" aria-describedby="choice-dialog-message" className="w-full max-w-md rounded-[18px] bg-white shadow-[0_24px_70px_rgb(var(--theme-shadow-rgb)/0.3)] outline-none">
          <div className="p-6">
            <h2 id="choice-dialog-title" className="text-lg font-black text-animeo-dark">{title}</h2>
            <p id="choice-dialog-message" className="mt-2 whitespace-pre-line text-sm leading-relaxed text-animeo-muted">{message}</p>
          </div>
          <div className="grid gap-2 border-t border-animeo-border-soft p-5">
            {choices.map((choice) => (
              <button key={choice.label} type="button" onClick={choice.onSelect} className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-extrabold transition ${tones[choice.tone ?? "neutral"]}`}>
                {choice.label}
              </button>
            ))}
            <button type="button" onClick={onClose} className="min-h-11 rounded-xl px-5 py-2.5 text-sm font-extrabold text-animeo-muted transition hover:bg-animeo-bg">{cancelLabel}</button>
          </div>
        </section>
      </div>
    </OverlayPortal>
  );
}

/**
 * Annuler un rendez-vous. Seul : la confirmation habituelle. Dans une
 * visite : toute la visite (par défaut), ou seulement celui-ci.
 */
export function CancelAppointmentDialog({ appointment, title, message, confirmLabel, onCancelled, onClose }: {
  appointment: Appointment;
  title: string;
  message: string;
  confirmLabel: string;
  onCancelled: () => void;
  onClose: () => void;
}) {
  const { updateAppointmentStatus, cancelVisit, cancelVisitMember } = useAppointments();
  const members = useVisitMembers(appointment);
  const wasRequest = appointment.status === "pending";

  async function run(action: () => Promise<{ ok: boolean; error?: string }>, success: string) {
    onClose();
    const result = await action();
    if (!result.ok) return void notify.error(result.error ?? "Une erreur est survenue.");
    notify.success(success);
    onCancelled();
  }

  if (members.length === 0 || !appointment.visitGroupId) {
    return (
      <ConfirmModal
        title={title}
        message={message}
        confirmLabel={confirmLabel}
        cancelLabel="Garder"
        onConfirm={() => run(() => updateAppointmentStatus(appointment.id, "cancelled"), wasRequest ? "Demande refusée — le créneau est de nouveau libre." : "Rendez-vous annulé — le créneau est de nouveau libre.")}
        onClose={onClose}
      />
    );
  }

  const visitGroupId = appointment.visitGroupId;
  const names = frenchList(members.map((member) => member.animalName));
  return (
    <ChoiceModal
      title="Annuler la visite ?"
      message={`${names} (${appointment.clientName}) sont vus à la suite à partir de ${members[0].start}. Les rendez-vous restent dans l’historique, et le client est prévenu une seule fois.`}
      choices={[
        { label: "Annuler toute la visite", tone: "danger", onSelect: () => run(() => cancelVisit(visitGroupId), `Visite annulée (${names}).`) },
        { label: `Seulement le rendez-vous de ${appointment.animalName}`, onSelect: () => run(() => cancelVisitMember(appointment.id), `Rendez-vous de ${appointment.animalName} annulé, il quitte la visite.`) },
      ]}
      cancelLabel="Garder"
      onClose={onClose}
    />
  );
}
