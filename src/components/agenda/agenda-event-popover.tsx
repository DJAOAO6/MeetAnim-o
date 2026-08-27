"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AppointmentForm } from "@/components/appointments/appointment-form";
import { Icon, type IconName } from "@/components/ui/icon";
import { appointmentStatusLabels, type Appointment, type AppointmentStatus } from "@/data/appointments";
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

const statusStyles: Record<AppointmentStatus, string> = {
  pending: "bg-[#fff1d5] text-[#986216]",
  confirmed: "bg-animeo-soft text-[#24755f]",
  completed: "bg-[#e8f1f4] text-animeo-dark",
  cancelled: "bg-[#eef1f1] text-animeo-muted",
};

export function AgendaEventPopover({ appointment, clients, anchorRect, onSave, onClose }: AgendaEventPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<"view" | "edit">("view");
  const popoverRef = useRef<HTMLDivElement>(null);

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
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    function handleScroll(event: Event) {
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
    if (result.ok) setMode("view");
    return result;
  }

  return createPortal(
    <div className="fixed inset-0 z-[70]" role="presentation">
      <div
        ref={popoverRef}
        role="dialog"
        aria-modal="true"
        aria-label={`Rendez-vous de ${appointment.animalName}`}
        style={{ top: placement.top, left: placement.left, width: placement.width, maxHeight: placement.maxHeight }}
        className={`absolute flex origin-top flex-col overflow-hidden rounded-2xl border border-[#dce8e5] bg-animeo-bg shadow-[0_24px_55px_rgba(12,39,47,0.28)] transition duration-200 ease-out ${
          visible ? "translate-y-0 scale-100 opacity-100" : "-translate-y-2 scale-95 opacity-0"
        }`}
      >
        {mode === "view" ? (
          <AppointmentSummary appointment={appointment} onEdit={() => setMode("edit")} onClose={onClose} />
        ) : (
          <AppointmentForm appointment={appointment} clients={clients} onSave={handleSave} onBack={() => setMode("view")} backLabel="Retour à la fiche" />
        )}
      </div>
    </div>,
    document.body,
  );
}

function AppointmentSummary({ appointment, onEdit, onClose }: { appointment: Appointment; onEdit: () => void; onClose: () => void }) {
  const isHomeVisit = appointment.mode === "home";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[#dce8e5] bg-white p-4 sm:p-5">
        <div className="min-w-0">
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${statusStyles[appointment.status]}`}>
            {appointmentStatusLabels[appointment.status]}
          </span>
          <h3 className="mt-2 truncate text-lg font-black text-animeo-dark">
            {appointment.animalName}{appointment.animalSpecies ? ` · ${appointment.animalSpecies}` : ""}
          </h3>
          <p className="truncate text-sm font-bold text-animeo-muted">{appointment.clientName}</p>
        </div>
        <button type="button" onClick={onClose} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl text-animeo-muted">×</button>
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
        <SummaryRow icon="calendar" label="Date et heure" value={`${formatFullDate(appointment.date)} · ${appointment.start} (${appointment.duration} min)`} />
        <SummaryRow icon="services" label="Prestation" value={appointment.serviceName} />
        <SummaryRow icon="map" label="Lieu" value={isHomeVisit ? `Domicile · ${appointment.location}` : "Cabinet"} />
        <SummaryRow icon="euro" label="Tarif" value={formatPrice(appointment.price)} />
        {appointment.notes ? <SummaryRow icon="agenda" label="Notes" value={appointment.notes} /> : null}
      </div>

      <div className="border-t border-[#dce8e5] bg-white p-4 sm:p-5">
        <button type="button" onClick={onEdit} className="w-full rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90]">
          Modifier
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ icon, label, value }: { icon: IconName; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl bg-white px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-animeo-soft text-animeo-dark"><Icon name={icon} className="h-4 w-4" /></span>
      <span className="min-w-0">
        <span className="block text-[11px] font-extrabold uppercase tracking-[0.08em] text-animeo-muted">{label}</span>
        <span className="mt-0.5 block whitespace-pre-line text-sm font-bold text-animeo-dark">{value}</span>
      </span>
    </div>
  );
}

function formatFullDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" }).format(new Date(year, month - 1, day, 12));
}

function formatPrice(value: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 2 }).format(value);
}
