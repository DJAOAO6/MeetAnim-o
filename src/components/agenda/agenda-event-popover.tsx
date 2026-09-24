"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { AppointmentSummary } from "@/components/appointments/appointment-summary";
import { useAppointments } from "@/components/appointments/appointments-context";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { notify } from "@/lib/notify";
import type { Appointment } from "@/data/appointments";
import type { ClientPickerOption } from "@/data/clients";
import type { SaveAppointmentInput } from "@/lib/appointments-actions";

type AgendaEventPopoverProps = {
  appointment: Appointment;
  clients: ClientPickerOption[];
  anchorRect: DOMRect;
  onSave: (input: SaveAppointmentInput) => Promise<{ ok: boolean; error?: string }>;
  onClose: () => void;
};

const POPOVER_WIDTH = 400;
const POPOVER_MIN_HEIGHT = 600;
const MARGIN = 14;

export function AgendaEventPopover({ appointment, clients, anchorRect, onSave, onClose }: AgendaEventPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const popoverRef = useRef<HTMLDivElement>(null);
  const { updateAppointmentStatus } = useAppointments();
  // Confirmation d'annulation ouverte : la fiche ne se referme ni au clic
  // dans la confirmation, ni à Échap (qui ne ferme que la confirmation).
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const confirmingRef = useRef(false);
  useEffect(() => { confirmingRef.current = confirmingCancel; }, [confirmingCancel]);

  const placement = useMemo(() => {
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - MARGIN * 2);
    const left = Math.min(Math.max(anchorRect.left, MARGIN), window.innerWidth - width - MARGIN);
    const desiredHeight = Math.min(POPOVER_MIN_HEIGHT, window.innerHeight - MARGIN * 2);
    const top = Math.max(MARGIN, Math.min(anchorRect.bottom + 8, window.innerHeight - desiredHeight - MARGIN));
    const maxHeight = window.innerHeight - top - MARGIN;
    return { top, left, width, maxHeight };
  }, [anchorRect]);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (confirmingRef.current) return;
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (confirmingRef.current) return;
      if (event.key === "Escape") onClose();
    }
    function handleScroll(event: Event) {
      if (confirmingRef.current) return;
      if (popoverRef.current && event.target instanceof Node && popoverRef.current.contains(event.target)) return;
      onClose();
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", handleScroll, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", handleScroll, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  async function handleSave(input: SaveAppointmentInput) {
    const result = await onSave(input);
    if (!result.ok) return result;
    // Annulé depuis le formulaire : la fiche se ferme, le créneau libéré
    // apparaît aussitôt dans l'agenda.
    if (input.status === "cancelled" && appointment.status !== "cancelled") { onClose(); return result; }
    setMode("view");
    return result;
  }

  async function cancelAppointment() {
    const wasRequest = appointment.status === "pending";
    setConfirmingCancel(false);
    const result = await updateAppointmentStatus(appointment.id, "cancelled");
    if (!result.ok) { notify.error(result.error ?? "Une erreur est survenue."); return; }
    notify.success(wasRequest ? "Demande refusée — le créneau est de nouveau libre." : "Rendez-vous annulé — le créneau est de nouveau libre.");
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Rendez-vous de ${appointment.animalName}`}
        style={{ top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
        className={`absolute flex origin-top flex-col overflow-hidden rounded-2xl border border-animeo-border bg-animeo-bg shadow-[0_24px_55px_rgb(var(--theme-shadow-rgb)/0.28)] transition duration-200 ease-out ${
          visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-95 opacity-0"
        }`}
      >
        {mode === "view" ? (
          <AppointmentSummary appointment={appointment} onEdit={() => setMode("edit")} onBack={onClose} onCancel={() => setConfirmingCancel(true)} />
        ) : (
          <AppointmentForm appointment={appointment} clients={clients} onSave={handleSave} onBack={() => setMode("view")} backLabel="Retour à la fiche" />
        )}
      </div>
      {/* Hors de la fiche : elle est transformée (animation), ce qui
          confinerait une fenêtre fixe à ses propres dimensions. */}
      {confirmingCancel ? (
        <ConfirmModal
          title={appointment.status === "pending" ? "Refuser cette demande ?" : "Annuler ce rendez-vous ?"}
          message={`${appointment.animalName} (${appointment.clientName}), ${appointment.start}. Le rendez-vous reste dans l’historique, le créneau redevient libre, et le client en est prévenu.`}
          confirmLabel={appointment.status === "pending" ? "Refuser la demande" : "Annuler le rendez-vous"}
          cancelLabel="Garder"
          onConfirm={cancelAppointment}
          onClose={() => setConfirmingCancel(false)}
        />
      ) : null}
    </div>,
    document.body,
  );
}
