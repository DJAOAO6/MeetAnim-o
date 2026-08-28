"use client";

import Image from "next/image";
import { useEffect, useRef, type FormEvent } from "react";
import { useManualAvailability } from "@/components/availability/manual-availability";
import { BookingActions, StepHeading } from "@/components/booking/booking-ui";
import { servicePhotoFor } from "@/data/service-photos";
import type { BookingMode, PublicProfessional, PublicService } from "@/data/public-booking";

type ConsultationStepProps = {
  professional: PublicProfessional;
  serviceId: string | null;
  mode: BookingMode | null;
  onServiceChange: (serviceId: string) => void;
  onModeChange: (mode: BookingMode) => void;
  onNext: () => void;
};

function availabilityLabel(service: PublicService) {
  if (service.cabinetEnabled && service.homeEnabled) return "Cabinet ou domicile";
  if (service.homeEnabled) return "À domicile uniquement";
  return "Au cabinet uniquement";
}

export function ConsultationStep({ professional, serviceId, mode, onServiceChange, onModeChange, onNext }: ConsultationStepProps) {
  const { availability } = useManualAvailability();
  const service = professional.services.find((item) => item.id === serviceId);
  const locationRef = useRef<HTMLDivElement>(null);
  const skipNextScroll = useRef(true);

  useEffect(() => {
    if (skipNextScroll.current) {
      // Ne pas défiler au premier rendu : seulement quand l'utilisateur
      // vient de choisir une prestation, pas lorsqu'il revient sur cette
      // étape avec un choix déjà fait.
      skipNextScroll.current = false;
      return;
    }
    if (serviceId) locationRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [serviceId]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (serviceId && mode) onNext();
  }

  function selectService(nextServiceId: string) {
    onServiceChange(nextServiceId);
  }

  const cabinetOpen = service ? professional.cabinetAvailable && availability.cabinet.open && service.cabinetEnabled : false;
  const homeOpen = service ? professional.homeAvailable && availability.home.open && service.homeEnabled : false;

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 1 · Consultation" title="Quelle consultation souhaitez-vous ?" />
      <div className="grid gap-4 sm:grid-cols-2">
        {professional.services.map((item, index) => {
          const selected = serviceId === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => selectService(item.id)}
              aria-pressed={selected}
              className={`relative flex flex-col rounded-3xl border p-5 text-left shadow-[0_4px_18px_rgba(24,59,69,0.05)] transition outline-none touch-manipulation focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 sm:p-6 ${
                selected ? "border-2 border-animeo bg-animeo-soft" : "border-[#e5eaea] bg-white hover:border-[#aad5cd]"
              }`}
            >
              {selected ? (
                <span className="absolute -right-2.5 -top-2.5 flex h-7 w-7 items-center justify-center rounded-full bg-animeo text-white shadow-[0_4px_10px_rgba(79,175,159,0.35)]">
                  <CheckIcon />
                </span>
              ) : null}

              <span className="flex items-start gap-4 sm:gap-5">
                <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-animeo-soft">
                  <Image
                    src={servicePhotoFor(item.photoUrl, item.animalTypes[0])}
                    alt=""
                    unoptimized
                    priority={index < 2}
                    width={84}
                    height={84}
                    className="h-full w-full object-cover"
                  />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-balance text-lg font-black leading-tight text-animeo-dark">{item.name}</span>
                  <span className="mt-1.5 block text-sm leading-5 text-animeo-muted">{item.description}</span>
                  <span className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-animeo-bg px-3 py-1.5 text-xs font-extrabold text-animeo-dark">
                    <ClockIcon />
                    {item.duration}{"\u00A0"}min · {item.animalTypes.join(", ")}
                  </span>
                </span>
              </span>

              <span className="mt-5 block h-px bg-[#e9eeed]" />

              <span className="mt-4 flex items-end justify-end text-right">
                <span className="text-xs font-bold text-animeo-muted">{availabilityLabel(item)}</span>
              </span>
            </button>
          );
        })}
      </div>

      {service ? (
        <div ref={locationRef} className="mt-6 animate-gentle-reveal scroll-mt-6">
          <p className="mb-3 text-sm font-black text-animeo-dark">Où ?</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <ModeCard
              icon="⌂"
              title="Au cabinet"
              ariaLabel="Consultation au cabinet"
              detail={<>{professional.cabinetAddress}<br />{professional.cabinetPostalCode} {professional.cabinetCity}</>}
              price={`${service.cabinetPrice} €`}
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
              price={service.travelFeeMode === "none" ? `${service.homePrice} €` : `à partir de ${service.homePrice} €`}
              priceNote={service.travelFeeMode === "none" ? undefined : "Des frais de déplacement peuvent s’ajouter selon votre secteur."}
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

function CheckIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function ModeCard({ icon, title, ariaLabel, detail, price, priceNote, selected, disabled, disabledLabel, onClick }: { icon: string; title: string; ariaLabel: string; detail: React.ReactNode; price: string; priceNote?: string; selected: boolean; disabled: boolean; disabledLabel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} aria-label={ariaLabel} className={`touch-manipulation rounded-[18px] border-2 p-4 text-left outline-none transition focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 sm:p-5 ${selected ? "border-animeo bg-animeo-soft shadow-[0_8px_24px_rgba(79,175,159,0.12)]" : "border-[#dfe9e6] bg-white hover:border-[#aad5cd]"} disabled:cursor-not-allowed disabled:bg-[#f2f4f4] disabled:opacity-65`}>
      <span className="flex items-start justify-between gap-3">
        <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-xl ${selected ? "bg-animeo text-white" : "bg-animeo-soft text-animeo-dark"}`}>{icon}</span>
        {!disabled ? <span className="rounded-full bg-animeo-bg px-3 py-1.5 text-sm font-black text-animeo-dark">{price}</span> : null}
      </span>
      <span className="mt-3 block text-lg font-black text-animeo-dark">{title}</span>
      <span className="mt-3 block rounded-2xl bg-white/80 p-3 text-sm font-bold leading-5 text-animeo-dark">{disabled ? disabledLabel : detail}</span>
      {!disabled && priceNote ? <span className="mt-2 block text-xs leading-5 text-animeo-muted">{priceNote}</span> : null}
    </button>
  );
}
