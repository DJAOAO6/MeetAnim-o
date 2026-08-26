"use client";

import { useAppointments } from "@/components/appointments/appointments-context";
import { Icon } from "@/components/ui/icon";

export function DashboardFloatingActions() {
  const { appointments, openManager, openNewAppointment } = useAppointments();
  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;

  return (
    <div className="fixed bottom-6 right-6 z-40 flex flex-col items-center gap-4 sm:bottom-8 sm:right-8">
      <button
        type="button"
        onClick={() => openManager()}
        aria-label={`Gérer les rendez-vous${pendingCount > 0 ? ` — ${pendingCount} en attente` : ""}`}
        className="relative flex h-14 w-14 items-center justify-center rounded-full bg-animeo-dark text-white shadow-[0_10px_24px_rgba(14,42,59,0.35)] transition hover:-translate-y-0.5 hover:brightness-90 sm:h-16 sm:w-16"
      >
        <Icon name="calendar" className="h-6 w-6" />
        {pendingCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-animeo-accent px-1.5 text-xs font-black text-white">
            {pendingCount}
          </span>
        ) : null}
      </button>

      <button
        type="button"
        onClick={openNewAppointment}
        aria-label="Créer un nouveau rendez-vous"
        className="flex h-14 w-14 items-center justify-center rounded-full bg-animeo text-white shadow-[0_10px_24px_rgba(79,175,159,0.35)] transition hover:-translate-y-0.5 hover:brightness-90 sm:h-16 sm:w-16"
      >
        <Icon name="calendarPlus" className="h-6 w-6" />
      </button>
    </div>
  );
}
