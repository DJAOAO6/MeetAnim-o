"use client";

import Link from "next/link";
import { Building2, Car, CheckCircle, Clock, FileText, MapPin, Navigation, PawPrint, Pencil, Phone, Scissors, User } from "lucide-react";
import { appointmentStatusLabels, type Appointment } from "@/data/appointments";
import { statusTone } from "@/components/appointments/appointment-status";
import { useAppointmentActions } from "@/components/appointments/use-appointment-actions";
import { Button } from "@/components/ui/button";
import { formatEuros } from "@/lib/format";
import { toTelHref } from "@/lib/phone";
import { minutesToTime, timeToMinutes } from "@/lib/booking-validation";

/**
 * Fiche du rendez-vous sélectionné, à droite de la liste.
 *
 * Elle existe pour éviter l'aller-retour : consulter cinq rendez-vous ne doit
 * pas demander d'ouvrir et refermer cinq fenêtres. Rien n'y est modifiable —
 * la modification passe par « Modifier », qui ouvre le formulaire complet,
 * pour qu'un champ ne puisse pas être changé par mégarde en lisant.
 */
export function AppointmentDetailsPanel({ appointment, onEdit, actions }: {
  appointment: Appointment;
  onEdit: () => void;
  /**
   * Gestes de fin de consultation, fournis par la fenêtre plutôt que créés
   * ici : le menu d'une ligne de liste déclenche exactement les mêmes, et une
   * seconde instance afficherait une seconde proposition de rappel.
   */
  actions: ReturnType<typeof useAppointmentActions>;
}) {
  const tone = statusTone(appointment.status);
  const end = minutesToTime(timeToMinutes(appointment.start) + appointment.duration);
  const PlaceIcon = appointment.mode === "cabinet" ? Building2 : Car;
  const { complete, completing, createDocument, creatingDocument, canCreateDocument } = actions;

  return (
    <article className="flex h-full flex-col rounded-2xl border border-animeo-border bg-animeo-bg p-5">
      <header>
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-extrabold ${tone.chip}`}>
          <span aria-hidden="true" className={`h-2 w-2 rounded-full ${tone.dot}`} />
          {appointmentStatusLabels[appointment.status]}
        </span>
        <h3 className="mt-3 text-xl font-black text-animeo-dark">{appointment.animalName}</h3>
        <p className="text-sm font-bold text-animeo-muted">{appointment.clientName}</p>
      </header>

      <dl className="mt-5 grid gap-4 border-t border-animeo-border-soft pt-5 text-sm">
        <DetailRow icon={<Clock aria-hidden="true" className="h-4 w-4" />} label="Horaire">
          <span className="block font-extrabold capitalize text-animeo-dark">{formatLongDate(appointment.date)}</span>
          <span className="block text-xs text-animeo-muted">{appointment.start} → {end} · {appointment.duration} min</span>
        </DetailRow>

        <DetailRow icon={<Scissors aria-hidden="true" className="h-4 w-4" />} label="Prestation">
          <span className="block font-extrabold text-animeo-dark">{appointment.serviceName}</span>
          <span className="block text-xs text-animeo-muted">{formatEuros(appointment.price)}</span>
        </DetailRow>

        <DetailRow icon={<PlaceIcon aria-hidden="true" className="h-4 w-4" />} label="Lieu">
          <span className="block font-extrabold text-animeo-dark">{appointment.mode === "cabinet" ? "Cabinet" : "Domicile"}</span>
          <span className="block text-xs text-animeo-muted">{appointment.location}</span>
        </DetailRow>

        {appointment.clientPhone ? (
          <DetailRow icon={<Phone aria-hidden="true" className="h-4 w-4" />} label="Téléphone">
            {/* Lien tel: : sur téléphone, rappeler un client depuis sa fiche
                de rendez-vous est le geste le plus fréquent. */}
            <a href={`tel:${appointment.clientPhone.replace(/\s/g, "")}`} className="font-extrabold text-animeo underline-offset-2 hover:underline">
              {appointment.clientPhone}
            </a>
          </DetailRow>
        ) : null}
      </dl>

      {appointment.notes.trim() ? (
        <div className="mt-4 rounded-xl border border-animeo-border bg-white p-3">
          <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">Notes</p>
          <p className="mt-1 whitespace-pre-line text-xs text-animeo-dark">{appointment.notes}</p>
        </div>
      ) : null}

      <div className="mt-auto grid gap-2 pt-5">
        {/* « Consultation réalisée » n'est pas un simple changement de statut :
            l'action crée aussi la consultation au dossier de l'animal et
            propose un rappel à la bonne échéance. */}
        {appointment.status === "confirmed" ? (
          <Button type="button" variant="secondary" onClick={() => complete(appointment)} disabled={completing}>
            <CheckCircle aria-hidden="true" className="h-4 w-4" />
            {completing ? "Enregistrement…" : "Consultation réalisée"}
          </Button>
        ) : null}

        {appointment.status === "completed" && canCreateDocument ? (
          <Button type="button" variant="secondary" onClick={() => createDocument(appointment)} disabled={creatingDocument}>
            <FileText aria-hidden="true" className="h-4 w-4" />
            {creatingDocument ? "Ouverture…" : "Créer le compte rendu"}
          </Button>
        ) : null}

        <Button type="button" onClick={onEdit}>
          <Pencil aria-hidden="true" className="h-4 w-4" />
          Modifier le rendez-vous
        </Button>

        <div className="grid grid-cols-2 gap-2">
          {appointment.clientId ? (
            <Link
              href={`/dashboard/clients/${appointment.clientId}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <User aria-hidden="true" className="h-4 w-4" />
              Fiche client
            </Link>
          ) : null}
          {appointment.clientId && appointment.animalId ? (
            <Link
              href={`/dashboard/clients/${appointment.clientId}?animal=${appointment.animalId}`}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <PawPrint aria-hidden="true" className="h-4 w-4" />
              Fiche animal
            </Link>
          ) : null}

          {/* Itinéraire : ce dont on a besoin juste avant de partir, et qui
              n'a de sens que pour une visite à domicile. */}
          {appointment.mode === "home" ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(appointment.location)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <Navigation aria-hidden="true" className="h-4 w-4" />
              Itinéraire
            </a>
          ) : null}

          {appointment.clientPhone ? (
            <a
              href={toTelHref(appointment.clientPhone) ?? undefined}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <Phone aria-hidden="true" className="h-4 w-4" />
              Appeler
            </a>
          ) : null}
        </div>
      </div>

    </article>
  );
}

function DetailRow({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
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

/** Repère visuel quand aucun rendez-vous n'est sélectionné. */
export function AppointmentDetailsPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-2xl border border-dashed border-animeo-border-strong bg-animeo-bg p-8 text-center">
      <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-animeo-muted">
        <MapPin className="h-5 w-5" />
      </span>
      <p className="mt-3 text-sm font-extrabold text-animeo-dark">Aucun rendez-vous sélectionné</p>
      <p className="mt-1 max-w-xs text-xs text-animeo-muted">Choisissez un rendez-vous dans la liste pour voir sa fiche sans quitter cet écran.</p>
    </div>
  );
}

function formatLongDate(dateId: string): string {
  const [year, month, day] = dateId.split("-").map(Number);
  return new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(new Date(year, month - 1, day, 12));
}
