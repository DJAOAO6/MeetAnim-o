"use client";

import { useState, type FormEvent } from "react";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { bookingDates, type AnimalInformation, type BookingAddress, type BookingMode, type OwnerInformation, type PublicBookingRequest, type PublicProfessional, type PublicService } from "@/data/public-booking";

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
  const date = bookingDates.find((item) => item.id === dateId);

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
            <SummaryLine label="Date" value={date?.fullLabel ?? dateId} />
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
        <span className="text-sm leading-6 text-animeo-dark">J’accepte l’utilisation de mes informations pour traiter cette demande. <span className="font-extrabold text-animeo underline">Politique de confidentialité</span></span>
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
  const date = bookingDates.find((item) => item.id === request.date);
  const lieu = request.mode === "CABINET" ? `${professional.cabinetAddress}, ${professional.cabinetCity}` : [request.address?.city, request.address?.postalCode].filter(Boolean).join(" · ");

  return (
    <div role="status" aria-live="polite" className="py-4 text-center sm:py-8">
      <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-[#e7f7f1] text-4xl text-[#278064]">✓</div>
      <span className="mt-5 inline-flex rounded-full bg-[#fff2dc] px-3 py-1.5 text-xs font-black text-[#a66a12]">En attente de validation</span>
      <h2 className="mx-auto mt-4 max-w-xl text-2xl font-black text-animeo-dark sm:text-3xl">Demande envoyée à {professional.firstName}</h2>

      <div className="mx-auto mt-6 max-w-md rounded-[18px] bg-animeo-soft p-5 text-left">
        <p className="text-lg font-black text-animeo-dark">{request.animal.name} · {service.name}</p>
        <p className="mt-2 text-sm font-extrabold text-animeo-dark">{date?.fullLabel ?? request.date} à {request.time}</p>
        <p className="mt-1 text-sm text-animeo-muted">{request.mode === "CABINET" ? "Au cabinet" : "À domicile"}{lieu ? ` · ${lieu}` : ""}</p>
      </div>

      <button type="button" onClick={onReset} className="mt-7 min-h-12 rounded-2xl bg-animeo px-7 py-3 text-sm font-extrabold text-white shadow-sm">Retour</button>
    </div>
  );
}
