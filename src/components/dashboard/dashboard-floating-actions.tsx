"use client";

import { useAppointments } from "@/components/appointments/appointments-context";
import { Icon } from "@/components/ui/icon";

export function DashboardFloatingActions() {
  const { appointments, openManager, openNewAppointment } = useAppointments();
  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;

  return (
    // Empilement horizontal sous sm : réduit l'empreinte verticale du
    // cluster (~152px en colonne) à celle d'une seule rangée de boutons,
    // pour ne plus recouvrir plusieurs lignes de contenu réel sur mobile
    // (AUDIT_COMPLET.md P1-6). Colonne conservée à partir de sm, où le
    // problème n'a pas été constaté et où l'espace vertical est moins rare.
    <div className="fixed bottom-6 right-6 z-40 flex flex-row-reverse items-center gap-3 sm:bottom-8 sm:right-8 sm:flex-col sm:gap-4">
      <button
        type="button"
        onClick={() => openNewAppointment()}
        aria-label="Créer un nouveau rendez-vous"
        className="flex h-12 w-12 items-center justify-center rounded-full bg-animeo text-white shadow-[0_10px_24px_rgba(79,175,159,0.35)] transition hover:-translate-y-0.5 hover:brightness-90 sm:h-16 sm:w-16"
      >
        <Icon name="calendarPlus" className="h-5 w-5 sm:h-6 sm:w-6" />
      </button>

      <button
        type="button"
        onClick={() => openManager()}
        aria-label={`Gérer les rendez-vous${pendingCount > 0 ? ` — ${pendingCount} en attente` : ""}`}
        className="relative flex h-12 w-12 items-center justify-center rounded-full bg-animeo-dark text-white shadow-[0_10px_24px_rgba(14,42,59,0.35)] transition hover:-translate-y-0.5 hover:brightness-90 sm:h-16 sm:w-16"
      >
        <Icon name="calendar" className="h-5 w-5 sm:h-6 sm:w-6" />
        {pendingCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-animeo-accent px-1.5 text-xs font-black text-white">
            {pendingCount}
          </span>
        ) : null}
      </button>
    </div>
  );
}
