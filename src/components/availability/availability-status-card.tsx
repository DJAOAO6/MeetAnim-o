"use client";

import { DashboardCard } from "@/components/dashboard/dashboard-card";
import { useAvailabilityState } from "@/components/availability/availability-state-provider";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import {
  availabilityStatus,
  daySlotsFor,
  formatClosurePeriod,
  formatSlot,
  modeLabels,
  todayTimingLabel,
  type AvailabilityMode,
} from "@/lib/availability-status";

type Tone = "open" | "closed" | "warning";

// Teintes prises sur les jetons vérifiés en contraste (animeo-positive /
// animeo-danger suivent le thème), pas sur les couleurs fixes des toasts.
const tones: Record<Tone, { dot: string; chip: string }> = {
  open: { dot: "bg-animeo-positive", chip: "bg-animeo-positive-soft text-animeo-positive" },
  closed: { dot: "bg-animeo-danger", chip: "bg-animeo-danger-soft text-animeo-danger" },
  warning: { dot: "bg-animeo-accent", chip: "bg-animeo-warning-soft text-animeo-warning" },
};

/**
 * Carte d'ouverture d'un mode de réservation.
 *
 * Elle répond du premier coup d'œil à la question du matin — « mes clients
 * peuvent-ils réserver, et jusqu'à quelle heure ? » — puis mène au
 * gestionnaire de disponibilités pour tout le reste. Elle n'invente aucun
 * état : le statut vient de availabilityStatus() et les horaires des
 * créneaux réellement configurés.
 *
 * Le statut n'est jamais porté par la seule couleur : la pastille a toujours
 * son libellé à côté.
 */
export function AvailabilityStatusCard({ mode }: { mode: AvailabilityMode }) {
  const { cabinetAvailable, homeAvailable, availability, manage } = useAvailabilityState();
  // L'heure courante ne peut pas être lue au rendu serveur sans risquer un
  // écart avec le navigateur : la précision horaire n'arrive qu'après montage.
  const mounted = useHasMounted();

  const open = mode === "cabinet" ? cabinetAvailable : homeAvailable;
  const status = availabilityStatus(mode, open, availability);
  const slots = daySlotsFor(availability, mode);
  const label = modeLabels[mode];

  const { tone, headline, detail } = describe();

  /**
   * Le titre porte l'état, jamais l'heure : « Ouvert aujourd'hui » se lit d'un
   * coup d'œil et tient dans une carte étroite, là où « Ferme à 20h00 » se
   * faisait tronquer sur tablette et obligeait à réfléchir pour savoir si
   * c'était une bonne ou une mauvaise nouvelle. La précision horaire suit,
   * sur la ligne de détail.
   */
  function describe(): { tone: Tone; headline: string; detail: string } {
    if (status.kind === "closed") {
      return { tone: "closed", headline: "Fermé aux réservations", detail: `Vos clients ne peuvent pas réserver ${mode === "cabinet" ? "au cabinet" : "à domicile"}.` };
    }
    if (status.kind === "closing") {
      return { tone: "closed", headline: "Fermé aujourd’hui", detail: `Fermeture ${formatClosurePeriod(status.closure)}${status.closure.reason ? ` · ${status.closure.reason}` : ""}.` };
    }
    if (slots.length === 0) {
      return { tone: "warning", headline: "Aucun créneau aujourd’hui", detail: "Aucun horaire n’est ouvert ce jour de la semaine." };
    }
    if (status.kind === "scheduled") {
      return { tone: "warning", headline: "Ouvert aujourd’hui", detail: `Fermeture prévue ${formatClosurePeriod(status.closure)}.` };
    }
    const timing = mounted ? todayTimingLabel(slots) : null;
    return { tone: "open", headline: "Ouvert aujourd’hui", detail: timing ? `${timing}.` : "Réservations ouvertes." };
  }

  return (
    <DashboardCard
      icon={mode === "cabinet" ? "home" : "car"}
      eyebrow={label}
      title={headline}
      footer={
        // Le bouton seul dans le pied : la phrase de détail partageait la
        // ligne avec lui et se coupait en deux dès que la carte se resserrait.
        <button
          type="button"
          onClick={() => manage(mode)}
          aria-label={`Gérer les disponibilités — ${label}`}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl bg-animeo-soft px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft-strong"
        >
          <Icon name="settings" className="h-4 w-4" />
          Gérer les disponibilités
        </button>
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${tones[tone].chip}`}>
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tones[tone].dot}`} />
          {tone === "open" ? "Ouvert" : tone === "closed" ? "Fermé" : "Attention"}
        </span>

        {slots.length > 0 ? (
          <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-sm font-bold text-animeo-dark">
            <Icon aria-hidden="true" name="calendar" className="h-4 w-4 shrink-0 text-animeo-muted" />
            {slots.map((slot) => (
              <span key={`${slot.start}-${slot.end}`} className="tabular-nums">{formatSlot(slot)}</span>
            ))}
          </span>
        ) : null}
      </div>

      <p className="mt-2 text-xs text-animeo-muted">{detail}</p>
    </DashboardCard>
  );
}
