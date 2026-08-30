"use client";

import { Icon, type IconName } from "@/components/ui/icon";
import { appointmentStatusLabels, type Appointment, type AppointmentStatus } from "@/data/appointments";

const statusStyles: Record<AppointmentStatus, string> = {
  pending: "bg-[#fff1d5] text-[#986216]",
  confirmed: "bg-animeo-soft text-[#24755f]",
  completed: "bg-[#e8f1f4] text-animeo-dark",
  cancelled: "bg-[#eef1f1] text-animeo-muted",
};

type AppointmentSummaryProps = {
  appointment: Appointment;
  onEdit: () => void;
  onBack: () => void;
  // Fournir un libellé affiche un lien "← {backLabel}" au-dessus de la
  // fiche (retour à une liste, ex. GlobalAppointmentsManager) plutôt qu'un
  // bouton "×" isolé (fermeture d'une popover flottante sans liste, ex.
  // AgendaEventPopover) — même distinction que AppointmentForm.
  backLabel?: string;
};

/**
 * Fiche récapitulative en lecture seule d'un rendez-vous, affichée avant le
 * formulaire de modification (jamais directement dessus) pour éviter de
 * modifier une information par mégarde en atterrissant sur un champ éditable.
 */
export function AppointmentSummary({ appointment, onEdit, onBack, backLabel }: AppointmentSummaryProps) {
  const isHomeVisit = appointment.mode === "home";

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-start justify-between gap-3 border-b border-[#dce8e5] bg-white p-4 sm:p-5">
        <div className="min-w-0">
          {backLabel ? (
            <button type="button" onClick={onBack} className="mb-3 inline-flex items-center gap-1 text-sm font-extrabold text-animeo">
              <span aria-hidden="true">←</span> {backLabel}
            </button>
          ) : null}
          <span className={`inline-flex rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.06em] ${statusStyles[appointment.status]}`}>
            {appointmentStatusLabels[appointment.status]}
          </span>
          <h3 className="mt-2 truncate text-lg font-black text-animeo-dark">
            {appointment.animalName}{appointment.animalSpecies ? ` · ${appointment.animalSpecies}` : ""}
          </h3>
          <p className="truncate text-sm font-bold text-animeo-muted">{appointment.clientName}</p>
        </div>
        {!backLabel ? (
          <button type="button" onClick={onBack} aria-label="Fermer" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-bg text-xl text-animeo-muted">×</button>
        ) : null}
      </div>

      <div className="flex-1 space-y-2.5 overflow-y-auto p-4 sm:p-5">
        <SummaryRow icon="calendar" label="Date et heure" value={`${formatFullDate(appointment.date)} · ${appointment.start} (${appointment.duration} min)`} />
        <SummaryRow icon="services" label="Prestation" value={appointment.serviceName} />
        <SummaryRow icon="map" label="Lieu" value={isHomeVisit ? `Domicile · ${appointment.location}` : "Cabinet"} />
        <SummaryRow icon="euro" label="Tarif" value={formatPrice(appointment.price)} />
        {appointment.notes ? <SummaryRow icon="agenda" label="Notes" value={appointment.notes} /> : null}
      </div>

      <div className="border-t border-[#dce8e5] bg-white p-4 sm:p-5">
        {appointment.clientId || isHomeVisit ? (
          <div className="mb-2 grid grid-cols-2 gap-2">
            {appointment.clientId ? (
              <a href={`/dashboard/clients/${appointment.clientId}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#d9e5e2] px-3 py-2.5 text-xs font-extrabold text-animeo-dark transition hover:border-animeo hover:text-animeo">
                <Icon name="clients" className="h-3.5 w-3.5" />
                Fiche client
              </a>
            ) : <span />}
            {isHomeVisit ? (
              <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-[#d9e5e2] px-3 py-2.5 text-xs font-extrabold text-animeo-dark transition hover:border-animeo hover:text-animeo">
                <Icon name="map" className="h-3.5 w-3.5" />
                Itinéraire
              </a>
            ) : <span />}
          </div>
        ) : null}
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
