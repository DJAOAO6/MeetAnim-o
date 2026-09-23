"use client";

import { usePathname } from "next/navigation";
import { CalendarCheck, CalendarPlus } from "lucide-react";
import { useAppointments } from "@/components/appointments/appointments-context";

// Routes où ce cluster entre en concurrence directe avec les actions déjà
// présentes à l'écran (unification des tournées, phase 2 : "+ Nouvelle
// journée", "Ouvrir ma tournée"…) — masqué plutôt que superposé. Pendant
// la configuration initiale aussi : il n'y a encore ni horaires ni
// prestations, et un rendez-vous n'y aurait pas de sens.
const HIDDEN_ON_ROUTES = ["/dashboard/tournees", "/dashboard/bienvenue"];

export function DashboardFloatingActions() {
  const pathname = usePathname();
  const { appointments, openManager, openNewAppointment } = useAppointments();
  const pendingCount = appointments.filter((appointment) => appointment.status === "pending").length;

  if (HIDDEN_ON_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))) return null;

  return (
    // Masqué sous md : la barre de navigation du bas (MobileBottomNav) et le
    // bouton principal de chaque page couvrent ces deux actions sur mobile,
    // où ce cluster flottant recouvrait du contenu réel — ici les cartes de
    // statistiques et les filtres de l'agenda.
    <div className="fixed bottom-8 right-8 z-40 hidden flex-col items-end gap-4 md:flex">
      <FloatingAction
        label="Nouveau rendez-vous"
        onClick={() => openNewAppointment()}
        className="bg-animeo shadow-[0_10px_24px_color-mix(in_srgb,var(--theme-brand)_35%,transparent)]"
      >
        <CalendarPlus aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" />
      </FloatingAction>

      <FloatingAction
        label={`Gestion des rendez-vous${pendingCount > 0 ? ` — ${pendingCount} en attente` : ""}`}
        onClick={() => openManager()}
        className="bg-animeo-dark shadow-[0_10px_24px_rgba(14,42,59,0.35)]"
        badge={pendingCount > 0 ? pendingCount : undefined}
      >
        <CalendarCheck aria-hidden="true" className="h-5 w-5 sm:h-6 sm:w-6" />
      </FloatingAction>
    </div>
  );
}

/**
 * Bouton flottant et son intitulé.
 *
 * L'intitulé apparaît au survol **à gauche** du bouton, jamais au-dessus :
 * les deux boutons sont l'un sous l'autre, une étiquette au-dessus
 * recouvrirait son voisin. Il est rendu en permanence, seulement masqué,
 * pour que la souris ne le fasse pas apparaître puis disparaître en
 * traversant l'espace qui le sépare du bouton.
 *
 * `aria-label` porte le même texte : au clavier et au lecteur d'écran,
 * l'intitulé est disponible sans survol.
 */
function FloatingAction({ label, onClick, className, badge, children }: {
  label: string;
  onClick: () => void;
  className: string;
  badge?: number;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative flex items-center">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-[calc(100%+0.75rem)] whitespace-nowrap rounded-xl bg-animeo-dark px-3 py-2 text-xs font-extrabold text-white opacity-0 shadow-lg transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
      >
        {label}
      </span>

      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full text-white transition hover:-translate-y-0.5 hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-animeo-dark sm:h-16 sm:w-16 ${className}`}
      >
        {children}
        {badge !== undefined ? (
          <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-animeo-accent px-1.5 text-xs font-black text-white">
            {badge}
          </span>
        ) : null}
      </button>
    </div>
  );
}
