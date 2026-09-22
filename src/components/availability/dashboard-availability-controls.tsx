"use client";

import { useState } from "react";
import { AvailabilityManager } from "@/components/availability/availability-manager";
import { availabilityStatus, statusLabel, type AvailabilityMode, type AvailabilityStatus } from "@/lib/availability-status";
import type { AvailabilitySettings } from "@/data/settings";
import type { PracticeMode } from "@/lib/practice-mode";

type DashboardAvailabilityControlsProps = {
  cabinetAvailable: boolean;
  practiceMode: PracticeMode;
  homeAvailable: boolean;
  availability: AvailabilitySettings;
};

/**
 * Badges d'ouverture du tableau de bord. Ils répondent d'un coup d'œil à la
 * seule question qui compte le matin : « mes clients peuvent-ils réserver ? ».
 *
 * Le clic ouvre le gestionnaire de disponibilités plutôt que de fermer
 * directement : fermer, programmer des congés et corriger ses horaires sont
 * trois gestes voisins, autant les réunir. La fermeture immédiate y reste à
 * un clic, et toujours confirmée.
 *
 * L'ouverture réelle est persistée en base (cabinetAvailable/homeAvailable
 * sur BusinessProfile) et revérifiée côté serveur par
 * submitPublicBookingAction : le badge ne fait jamais qu'afficher un état,
 * il ne le simule pas.
 */
export function DashboardAvailabilityControls({ cabinetAvailable, homeAvailable, practiceMode, availability }: DashboardAvailabilityControlsProps) {
  const [cabinet, setCabinet] = useState(cabinetAvailable);
  const [home, setHome] = useState(homeAvailable);
  const [settings, setSettings] = useState(availability);
  const [managing, setManaging] = useState<AvailabilityMode | null>(null);

  return (
    <>
      <section aria-label="Disponibilités aux réservations" className="mb-6 flex flex-wrap items-center gap-3">
        <AvailabilityBadge mode="cabinet" status={availabilityStatus("cabinet", cabinet, settings)} onManage={() => setManaging("cabinet")} />
        <AvailabilityBadge mode="home" status={availabilityStatus("home", home, settings)} onManage={() => setManaging("home")} />
      </section>

      {managing ? (
        <AvailabilityManager
          initialMode={managing}
          cabinetAvailable={cabinet}
          practiceMode={practiceMode}
          homeAvailable={home}
          availability={settings}
          onClose={() => setManaging(null)}
          onApplied={(next) => {
            setCabinet(next.cabinetAvailable);
            setHome(next.homeAvailable);
            setSettings(next.availability);
          }}
        />
      ) : null}
    </>
  );
}

/**
 * Trois états, trois couleurs — mais jamais la couleur seule : le libellé dit
 * toujours l'état en toutes lettres, pour qui ne distingue pas le vert du
 * rouge comme pour qui écoute la page.
 */
function AvailabilityBadge({ mode, status, onManage }: { mode: AvailabilityMode; status: AvailabilityStatus; onManage: () => void }) {
  const tone =
    status.kind === "open" ? { dot: "bg-animeo-success shadow-[0_0_0_4px_rgba(54,162,107,0.16)]", frame: "border-animeo-soft-strong bg-white text-animeo-dark hover:bg-animeo-soft" }
    : status.kind === "closed" ? { dot: "bg-[#E05D5D] shadow-[0_0_0_4px_rgba(224,93,93,0.14)]", frame: "border-animeo-border bg-animeo-border-soft text-animeo-muted hover:bg-white" }
    : { dot: "bg-animeo-accent shadow-[0_0_0_4px_rgba(231,166,74,0.18)]", frame: "border-animeo-warning-border bg-animeo-warning-soft text-animeo-dark hover:bg-white" };

  return (
    <button
      type="button"
      onClick={onManage}
      aria-label={`${statusLabel(mode, status)} — gérer les disponibilités`}
      className={`inline-flex min-h-11 items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-extrabold transition ${tone.frame}`}
    >
      <span aria-hidden="true" className={`h-2.5 w-2.5 shrink-0 rounded-full ${tone.dot}`} />
      {statusLabel(mode, status)}
      <span aria-hidden="true" className="ml-1 text-xs text-animeo-muted">Gérer</span>
    </button>
  );
}
