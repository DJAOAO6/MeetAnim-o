"use client";

import { CalendarDays, Clock, MapPin, PawPrint, Scissors, User } from "lucide-react";
import { appointmentStatusLabels } from "@/data/appointments";
import { formatEuros } from "@/lib/format";
import { minutesToTime, timeToMinutes } from "@/lib/booking-validation";
import type { AppointmentDraft } from "@/components/appointments/use-appointment-draft";
import { composeLocation } from "@/components/appointments/use-appointment-draft";
import { statusTone } from "@/components/appointments/appointment-status";

/**
 * Aperçu du rendez-vous, mis à jour à chaque frappe.
 *
 * Il sert à relire à voix haute ce qu'on vient de saisir — « donc mardi 16 à
 * 9 h pour Rex, au cabinet » — avant de valider. Chaque ligne absente est
 * dite absente plutôt que laissée vide : un aperçu à trous ne se relit pas.
 */
export function AppointmentSummaryPanel({ draft, cabinetAddress }: { draft: AppointmentDraft; cabinetAddress: string }) {
  const endTime = minutesToTime(timeToMinutes(draft.start) + draft.duration);
  const tone = statusTone(draft.status);

  return (
    <aside aria-label="Aperçu du rendez-vous" className="flex h-full flex-col rounded-2xl border border-animeo-border bg-animeo-bg p-5">
      <h3 className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-[0.12em] text-animeo-muted">
        <CalendarDays aria-hidden="true" className="h-4 w-4" />
        Aperçu du rendez-vous
      </h3>

      <p className="mt-3 text-base font-black capitalize text-animeo-dark">{formatLongDate(draft.date)}</p>
      <p className="mt-0.5 flex items-center gap-2 text-sm font-bold text-animeo-dark">
        <Clock aria-hidden="true" className="h-4 w-4 shrink-0 text-animeo-muted" />
        {draft.start} → {endTime}
        <span className="font-semibold text-animeo-muted">({draft.duration} min)</span>
      </p>

      <dl className="mt-5 space-y-4 border-t border-animeo-border-soft pt-5 text-sm">
        <SummaryRow icon={<PawPrint aria-hidden="true" className="h-4 w-4" />} label="Animal">
          {draft.animalName ? (
            <>
              <span className="block font-extrabold text-animeo-dark">{draft.animalName}</span>
              {draft.animalDetail ? <span className="block text-xs text-animeo-muted">{draft.animalDetail}</span> : null}
            </>
          ) : <Missing>Aucun animal choisi</Missing>}
        </SummaryRow>

        <SummaryRow icon={<User aria-hidden="true" className="h-4 w-4" />} label="Client">
          {draft.clientName ? (
            <>
              <span className="block font-extrabold text-animeo-dark">{draft.clientName}</span>
              {draft.clientPhone ? <span className="block text-xs text-animeo-muted">{draft.clientPhone}</span> : null}
            </>
          ) : <Missing>Aucun client choisi</Missing>}
        </SummaryRow>

        <SummaryRow icon={<Scissors aria-hidden="true" className="h-4 w-4" />} label="Prestation">
          {draft.serviceName ? (
            <>
              <span className="block font-extrabold text-animeo-dark">{draft.serviceName}</span>
              <span className="block text-xs text-animeo-muted">{formatEuros(draft.price)}</span>
            </>
          ) : <Missing>Aucune prestation choisie</Missing>}
        </SummaryRow>

        <SummaryRow icon={<MapPin aria-hidden="true" className="h-4 w-4" />} label="Lieu">
          <span className="block font-extrabold text-animeo-dark">
            {draft.place === "cabinet" ? "Cabinet" : draft.place === "tour" ? "Tournée" : "Domicile"}
          </span>
          <span className="block text-xs text-animeo-muted">
            {draft.place === "cabinet"
              ? (cabinetAddress || "Adresse du cabinet non renseignée")
              : composeLocation(draft).trim() || "Adresse à renseigner"}
          </span>
        </SummaryRow>
      </dl>

      <div className="mt-5 border-t border-animeo-border-soft pt-4">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${tone.chip}`}>
          <span aria-hidden="true" className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
          {appointmentStatusLabels[draft.status]}
        </span>
      </div>

      {draft.notes.trim() ? (
        <div className="mt-4 rounded-xl border border-animeo-border bg-white p-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Notes</p>
          <p className="mt-1 whitespace-pre-line text-xs text-animeo-dark">{draft.notes}</p>
        </div>
      ) : null}
    </aside>
  );
}

function SummaryRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-white text-animeo-muted">{icon}</span>
      <div className="min-w-0 flex-1">
        <dt className="sr-only">{label}</dt>
        <dd className="min-w-0">{children}</dd>
      </div>
    </div>
  );
}

function Missing({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs font-semibold italic text-animeo-muted">{children}</span>;
}

function formatLongDate(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  if (!year || !month || !day) return "Date à choisir";
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}
