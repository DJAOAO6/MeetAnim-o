"use client";

import { useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicBookingRequest, PublicProfessional, PublicService } from "@/data/public-booking";
import { buildIcsContent, formatBookingDateLabels, formatBookingReference } from "@/lib/booking-validation";

type BookingSummaryProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  address: BookingAddress;
  dateId: string;
  time: string;
  owner: OwnerInformation;
  animal: AnimalInformation;
  consultationPrice: number;
  travelFee: number;
  submitting?: boolean;
  submitError?: string | null;
  onBack: () => void;
  onSubmit: () => void;
};

function addMinutes(time: string, minutes: number) {
  const [hours, currentMinutes] = time.split(":").map(Number);
  const total = hours * 60 + currentMinutes + minutes;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

export function BookingSummary({ professional, mode, service, address, dateId, time, owner, animal, consultationPrice, travelFee, submitting = false, submitError, onBack, onSubmit }: BookingSummaryProps) {
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const date = formatBookingDateLabels(dateId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (privacyAccepted && !submitting) onSubmit();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 4 · Confirmation" title="Vérifiez votre demande" />

      <div className="overflow-hidden rounded-[18px] border border-[#dfe9e6]">
        <div className="bg-animeo-dark p-5 text-white sm:p-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.12em] text-[#85d4c7]">Votre rendez-vous</p>
          <h3 className="mt-2 text-2xl font-black">{animal.name}</h3>
          <p className="mt-1 text-white/75">{service.name} · {service.duration} min</p>
        </div>
        <div className="grid gap-0 bg-white sm:grid-cols-2">
          <SummarySection title="Date et lieu">
            <SummaryLine label="Mode" value={mode === "CABINET" ? "Au cabinet" : "À domicile"} />
            <SummaryLine label="Date" value={date.fullLabel} />
            <SummaryLine label="Horaire" value={`${time} – ${addMinutes(time, service.duration)}`} />
            <div className="mt-3 rounded-xl bg-animeo-bg p-3 text-sm font-bold leading-5 text-animeo-dark">
              {mode === "HOME" ? <>{address.address}{address.addressExtra ? <><br />{address.addressExtra}</> : null}<br />{address.postalCode} {address.city}</> : <>{professional.cabinetAddress}<br />{professional.cabinetPostalCode} {professional.cabinetCity}</>}
            </div>
          </SummarySection>
          <SummarySection title="Propriétaire">
            <SummaryLine label="Nom" value={`${owner.firstName} ${owner.lastName}`} />
            <SummaryLine label="Téléphone" value={owner.phone} />
            <SummaryLine label="Email" value={owner.email} />
            <SummaryLine label="Animal" value={`${animal.name} · ${animal.species}${animal.breed ? ` · ${animal.breed}` : ""}`} />
          </SummarySection>
        </div>
        <div className="border-t border-[#e1eae8] bg-animeo-soft p-5 sm:p-6">
          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Tarif</p>
          <SummaryLine label="Consultation" value={`${consultationPrice} €`} />
          <div className="mt-4 flex items-center justify-between border-t border-[#ccded9] pt-4"><span className="font-black text-animeo-dark">Total estimé</span><span className="text-2xl font-black text-animeo-dark">{consultationPrice + travelFee} €</span></div>
        </div>
      </div>

      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl border border-[#dfe9e6] p-4">
        <input type="checkbox" checked={privacyAccepted} onChange={(event) => setPrivacyAccepted(event.target.checked)} className="mt-1 h-5 w-5 shrink-0 accent-[#4FAF9F]" required />
        <span className="text-sm leading-6 text-animeo-dark">
          J’accepte l’utilisation de mes informations pour traiter cette demande.{" "}
          <a
            href={`/politique-de-confidentialite/${professional.slug}`}
            target="_blank"
            rel="noopener noreferrer"
            className="font-extrabold text-animeo underline underline-offset-2 hover:text-animeo-dark"
          >
            Politique de confidentialité
          </a>
        </span>
      </label>
      <p className="mt-3 rounded-2xl bg-[#fff7e7] p-3 text-sm font-bold text-[#8d651d]">Cette demande sera envoyée en attente de validation par {professional.firstName}.</p>
      {submitError ? <p role="alert" aria-live="polite" className="mt-3 rounded-2xl bg-[#fff1f1] p-3 text-sm font-bold text-[#a9573b]">{submitError} Revenez à l’étape précédente pour choisir un autre horaire.</p> : null}
      <BookingActions onBack={onBack} nextLabel={submitting ? "Réservation en cours…" : "Réserver mon rendez-vous"} nextDisabled={!privacyAccepted} loading={submitting} />
    </form>
  );
}

function SummarySection({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="p-5 sm:p-6 sm:[&:nth-child(2)]:border-l sm:[&:nth-child(2)]:border-[#e1eae8]"><p className="mb-3 text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">{title}</p><div className="space-y-2">{children}</div></div>;
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3 text-sm"><span className="text-animeo-muted">{label}</span><span className="text-right font-extrabold text-animeo-dark">{value}</span></div>;
}

export function BookingSuccess({ professional, request, service, onReset }: { professional: PublicProfessional; request: PublicBookingRequest; service: PublicService; onReset: () => void }) {
  const date = formatBookingDateLabels(request.date);
  const lieu = request.mode === "CABINET" ? `${professional.cabinetAddress}, ${professional.cabinetCity}` : [request.address?.city, request.address?.postalCode].filter(Boolean).join(" · ");
  const reference = formatBookingReference(request.id);

  // Fichier .ics généré côté client (aucune requête serveur nécessaire) et
  // proposé en data: URI plutôt qu'en Blob + URL.createObjectURL : un lien
  // <a download> statique suffit ici et évite de gérer la révocation de
  // l'URL objet.
  const icsHref = `data:text/calendar;charset=utf-8,${encodeURIComponent(
    buildIcsContent({
      uid: `${request.id}@animeo.app`,
      dateId: request.date,
      start: request.time,
      durationMinutes: service.duration,
      summary: `${service.name} — ${request.animal.name}`,
      description: `Rendez-vous avec ${professional.firstName} ${professional.lastName} (${professional.company}). Demande en attente de validation, référence ${reference}.`,
      location: request.mode === "CABINET" ? lieu : (lieu || "À domicile"),
    }),
  )}`;

  return (
    <div role="status" aria-live="polite" className="py-4 text-center sm:py-8">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e7f7f1] text-4xl text-[#278064]">✓</div>
      <span className="mt-5 inline-flex rounded-full bg-[#fff2dc] px-3 py-1.5 text-xs font-black text-[#a66a12]">En attente de validation</span>
      <h2 id="booking-step-heading" tabIndex={-1} className="mx-auto mt-4 max-w-xl rounded-md text-2xl font-black text-animeo-dark focus:outline-none focus:ring-2 focus:ring-animeo focus:ring-offset-2 sm:text-3xl">Demande envoyée à {professional.firstName}</h2>
      <p className="mt-2 text-xs font-bold uppercase tracking-wide text-animeo-muted">Référence {reference}</p>

      <div className="mx-auto mt-6 max-w-md rounded-[18px] bg-animeo-soft p-5 text-left">
        <p className="text-lg font-black text-animeo-dark">{request.animal.name} · {service.name}</p>
        <p className="mt-2 text-sm font-extrabold text-animeo-dark">{date.fullLabel} à {request.time}</p>
        <p className="mt-1 text-sm text-animeo-muted">{request.mode === "CABINET" ? "Au cabinet" : "À domicile"}{lieu ? ` · ${lieu}` : ""}</p>
      </div>

      <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
        <a
          href={icsHref}
          download={`rendez-vous-${reference}.ics`}
          className="flex min-h-12 touch-manipulation items-center justify-center gap-2 rounded-2xl border border-[#d2e0dd] px-6 py-3 text-sm font-extrabold text-animeo-dark outline-none transition hover:bg-animeo-bg focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2"
        >
          <CalendarPlusIcon />
          Ajouter à mon calendrier
        </a>
        <button type="button" onClick={onReset} className="min-h-12 touch-manipulation rounded-2xl bg-animeo px-7 py-3 text-sm font-extrabold text-white shadow-sm outline-none transition hover:bg-[#459e90] focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2">Retour</button>
      </div>
    </div>
  );
}

function CalendarPlusIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0">
      <rect x="3" y="5" width="18" height="16" rx="3" />
      <path d="M16 3v4M8 3v4M3 10h18M12 14v5M9.5 16.5h5" />
    </svg>
  );
}
