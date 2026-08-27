"use client";

import type { FormEvent } from "react";
import { useManualAvailability } from "@/components/availability/manual-availability";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import type { BookingMode, PublicProfessional, PublicService } from "@/data/public-booking";

type ConsultationStepProps = {
  professional: PublicProfessional;
  serviceId: string | null;
  mode: BookingMode | null;
  onServiceChange: (serviceId: string) => void;
  onModeChange: (mode: BookingMode) => void;
  onNext: () => void;
};

function minPriceFor(service: PublicService) {
  const prices = [
    service.cabinetEnabled ? service.cabinetPrice : null,
    service.homeEnabled ? service.homePrice : null,
  ].filter((price): price is number => price !== null);
  return prices.length > 0 ? Math.min(...prices) : null;
}

function availabilityLabel(service: PublicService) {
  if (service.cabinetEnabled && service.homeEnabled) return "Cabinet ou domicile";
  if (service.homeEnabled) return "À domicile uniquement";
  return "Au cabinet uniquement";
}

export function ConsultationStep({ professional, serviceId, mode, onServiceChange, onModeChange, onNext }: ConsultationStepProps) {
  const { availability } = useManualAvailability();
  const service = professional.services.find((item) => item.id === serviceId);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (serviceId && mode) onNext();
  }

  function selectService(nextServiceId: string) {
    onServiceChange(nextServiceId);
  }

  const cabinetOpen = service ? professional.cabinetAvailable && availability.cabinet.open && service.cabinetEnabled : false;
  const homeOpen = service ? professional.homeAvailable && availability.home.open && service.homeEnabled : false;
  const homeFeeNote = service?.travelFeeMode === "fixed"
    ? `+ ${service.fixedTravelFee} € de déplacement`
    : service?.travelFeeMode === "zone"
      ? "+ frais de déplacement selon votre zone"
      : null;

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 1 · Consultation" title="Quelle consultation souhaitez-vous ?" />
      <div className="space-y-3">
        {professional.services.map((item) => {
          const minPrice = minPriceFor(item);
          const selected = serviceId === item.id;
          return (
            <button key={item.id} type="button" onClick={() => selectService(item.id)} aria-pressed={selected} className={`flex w-full items-center justify-between gap-4 rounded-2xl border-2 p-4 text-left transition sm:p-5 ${selected ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
              <span className="min-w-0"><span className="block text-base font-black text-animeo-dark sm:text-lg">{item.name}</span><span className="mt-1 block text-sm text-animeo-muted">{item.description}</span><span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-animeo-muted">{item.duration} min · {item.animalTypes.join(", ")}</span></span>
              <span className="shrink-0 text-right">
                <span className="block text-xl font-black text-animeo-dark">{minPrice !== null ? `Dès ${minPrice} €` : "—"}</span>
                <span className="mt-0.5 block text-[11px] font-bold text-animeo-muted">{availabilityLabel(item)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {service ? (
        <div className="mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">Où ?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ModeCard
              icon="⌂"
              title="Au cabinet"
              ariaLabel="Consultation au cabinet"
              detail={<>{professional.cabinetAddress}<br />{professional.cabinetPostalCode} {professional.cabinetCity}</>}
              price={service.cabinetEnabled ? service.cabinetPrice : null}
              selected={mode === "CABINET"}
              disabled={!cabinetOpen}
              disabledLabel={!service.cabinetEnabled ? `Non proposée au cabinet` : "Cabinet fermé pour le moment"}
              onClick={() => onModeChange("CABINET")}
            />
            <ModeCard
              icon="⌖"
              title="À domicile"
              ariaLabel="Consultation à domicile"
              detail="Selon votre secteur et les tournées en cours."
              price={service.homeEnabled ? service.homePrice : null}
              priceNote={service.homeEnabled ? homeFeeNote : null}
              selected={mode === "HOME"}
              disabled={!homeOpen}
              disabledLabel={!service.homeEnabled ? "Proposée uniquement au cabinet" : "Domicile fermé pour le moment"}
              onClick={() => onModeChange("HOME")}
            />
          </div>
        </div>
      ) : null}

      <BookingActions nextDisabled={!serviceId || !mode} />
    </form>
  );
}

function ModeCard({ icon, title, ariaLabel, detail, price, priceNote, selected, disabled, disabledLabel, onClick }: { icon: string; title: string; ariaLabel: string; detail: React.ReactNode; price: number | null; priceNote?: string | null; selected: boolean; disabled: boolean; disabledLabel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={ariaLabel} className={`rounded-[18px] border-2 p-4 text-left transition sm:p-5 ${selected ? "border-animeo bg-animeo-soft shadow-[0_8px_24px_rgba(79,175,159,0.12)]" : "border-[#dfe9e6] bg-white hover:border-[#aad5cd]"} disabled:cursor-not-allowed disabled:bg-[#f2f4f4] disabled:opacity-65`}>
      <span className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl text-xl ${selected ? "bg-animeo text-white" : "bg-animeo-soft text-animeo-dark"}`}>{icon}</span>
        {price !== null && !disabled ? <span className="rounded-full bg-white px-3 py-1.5 text-sm font-black text-animeo-dark shadow-sm">{price} €</span> : null}
      </span>
      <span className="mt-3 block text-lg font-black text-animeo-dark">{title}</span>
      {priceNote && !disabled ? <span className="mt-1 block text-xs font-extrabold text-animeo">{priceNote}</span> : null}
      <span className="mt-3 block rounded-2xl bg-white/80 p-3 text-sm font-bold leading-5 text-animeo-dark">{disabled ? disabledLabel : detail}</span>
    </button>
  );
}
