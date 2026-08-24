"use client";

import type { FormEvent } from "react";
import { useManualAvailability } from "@/components/availability/manual-availability";
import { BookingActions, BookingField, StepHeading, bookingInputClassName } from "@/components/booking/booking-ui";
import type { BookingAddress, BookingMode, PublicProfessional, PublicService } from "@/data/public-booking";

type LocationStepProps = {
  professional: PublicProfessional;
  value: BookingMode | null;
  onChange: (mode: BookingMode) => void;
  onNext: () => void;
};

export function LocationStep({ professional, value, onChange, onNext }: LocationStepProps) {
  const { availability } = useManualAvailability();
  const cabinetOpen = professional.cabinetAvailable && availability.cabinet.open;
  const homeOpen = professional.homeAvailable && availability.home.open;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 1 · Lieu" title="Où souhaitez-vous réaliser votre consultation ?" description="Choisissez le mode qui vous convient. Les créneaux proposés seront adaptés à votre choix." />
      <div className="grid gap-4 sm:grid-cols-2">
        <ModeCard
          icon="⌂"
          title="Au cabinet"
          description="Je me rends au cabinet du professionnel."
          detail={<>{professional.cabinetAddress}<br />{professional.cabinetPostalCode} {professional.cabinetCity}</>}
          selected={value === "CABINET"}
          disabled={!cabinetOpen}
          disabledLabel="Cabinet fermé manuellement par le professionnel"
          onClick={() => onChange("CABINET")}
        />
        <ModeCard
          icon="⌖"
          title="À domicile"
          description="Le professionnel se déplace directement chez moi."
          detail="Disponibilité selon votre ville et les tournées organisées."
          selected={value === "HOME"}
          disabled={!homeOpen}
          disabledLabel="Domicile fermé manuellement par le professionnel"
          onClick={() => onChange("HOME")}
        />
      </div>
      <BookingActions nextDisabled={!value} />
    </form>
  );
}

function ModeCard({ icon, title, description, detail, selected, disabled, disabledLabel, onClick }: { icon: string; title: string; description: string; detail: React.ReactNode; selected: boolean; disabled: boolean; disabledLabel: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-pressed={selected} className={`min-h-56 rounded-3xl border-2 p-5 text-left transition ${selected ? "border-animeo bg-animeo-soft shadow-[0_8px_24px_rgba(79,175,159,0.12)]" : "border-[#dfe9e6] bg-white hover:border-[#aad5cd]"} disabled:cursor-not-allowed disabled:bg-[#f2f4f4] disabled:opacity-65`}>
      <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-2xl ${selected ? "bg-animeo text-white" : "bg-animeo-soft text-animeo-dark"}`}>{icon}</span>
      <span className="mt-4 block text-lg font-black text-animeo-dark">{title}</span>
      <span className="mt-1 block text-sm leading-6 text-animeo-muted">{description}</span>
      <span className="mt-4 block rounded-2xl bg-white/80 p-3 text-sm font-bold leading-5 text-animeo-dark">{disabled ? disabledLabel : detail}</span>
    </button>
  );
}

type ServiceStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  value: string | null;
  onChange: (serviceId: string) => void;
  onBack: () => void;
  onNext: () => void;
};

export function ServiceStep({ professional, mode, value, onChange, onBack, onNext }: ServiceStepProps) {
  const compatibleServices = professional.services.filter((service) => mode === "CABINET" ? service.cabinetEnabled : service.homeEnabled);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (value) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 2 · Prestation" title="Choisissez une prestation" description={`Seules les prestations disponibles ${mode === "CABINET" ? "au cabinet" : "à domicile"} sont affichées. Le bon tarif est appliqué automatiquement.`} />
      <div className="space-y-3">
        {compatibleServices.map((service) => {
          const price = mode === "CABINET" ? service.cabinetPrice : service.homePrice;
          const selected = value === service.id;
          return (
            <button key={service.id} type="button" onClick={() => onChange(service.id)} aria-pressed={selected} className={`flex w-full items-center justify-between gap-4 rounded-2xl border-2 p-4 text-left transition sm:p-5 ${selected ? "border-animeo bg-animeo-soft" : "border-[#dfe9e6] hover:border-[#aad5cd]"}`}>
              <span className="min-w-0"><span className="block text-base font-black text-animeo-dark sm:text-lg">{service.name}</span><span className="mt-1 block text-sm text-animeo-muted">{service.description}</span><span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-animeo-muted">{service.duration} min · {service.animalTypes.join(", ")}</span></span>
              <span className="shrink-0 text-xl font-black text-animeo-dark">{price} €</span>
            </button>
          );
        })}
      </div>
      <p className="mt-4 text-xs text-animeo-muted">Les petits ruminants ne sont pas proposés dans la V1.</p>
      <BookingActions onBack={onBack} nextDisabled={!value} />
    </form>
  );
}

type AddressStepProps = {
  professional: PublicProfessional;
  service: PublicService;
  value: BookingAddress;
  zoneId: string | null;
  onChange: (address: BookingAddress) => void;
  onZoneChange: (zoneId: string | null) => void;
  onBack: () => void;
  onNext: () => void;
  onSwitchToCabinet: () => void;
};

function normalizeCity(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[’']/g, "'");
}

function findMatchingZone(professional: PublicProfessional, address: BookingAddress) {
  const normalizedCity = normalizeCity(address.city);
  const normalizedPostalCode = address.postalCode.replace(/\s/g, "");

  return professional.zones.find((item) =>
    item.cities.some((city) => normalizeCity(city) === normalizedCity)
    || (normalizedPostalCode.length === 5 && item.postalCodes.includes(normalizedPostalCode)),
  );
}

export function AddressStep({ professional, service, value, zoneId, onChange, onZoneChange, onBack, onNext, onSwitchToCabinet }: AddressStepProps) {
  const zone = professional.zones.find((item) => item.id === zoneId);
  const hasLocation = value.city.trim().length >= 2 || value.postalCode.replace(/\s/g, "").length === 5;
  const travelFee = service.travelFeeMode === "fixed" ? service.fixedTravelFee : service.travelFeeMode === "zone" ? zone?.travelFee ?? 0 : 0;

  function update(key: keyof BookingAddress, next: string) {
    const address = { ...value, [key]: next };
    onChange(address);
    const matchingZone = findMatchingZone(professional, address);
    onZoneChange(matchingZone?.id ?? null);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (zoneId) onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 3 · Informations" title="Où doit se dérouler la consultation ?" description="Votre adresse permet d’identifier votre secteur, les tournées actives et les rendez-vous proches à regrouper." />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2"><BookingField label="Adresse" required><input value={value.address} onChange={(event) => update("address", event.target.value)} className={bookingInputClassName} placeholder="12 rue Exemple" required /></BookingField></div>
        <div className="sm:col-span-2"><BookingField label="Complément d’adresse" hint="Facultatif"><input value={value.addressExtra} onChange={(event) => update("addressExtra", event.target.value)} className={bookingInputClassName} placeholder="Bâtiment, étage, lieu-dit…" /></BookingField></div>
        <BookingField label="Code postal" required><input value={value.postalCode} onChange={(event) => update("postalCode", event.target.value)} className={bookingInputClassName} inputMode="numeric" placeholder="76000" required /></BookingField>
        <BookingField label="Ville" required><input value={value.city} onChange={(event) => update("city", event.target.value)} className={bookingInputClassName} placeholder="Rouen" required /></BookingField>
      </div>

      {zone ? (
        <div className="mt-5 rounded-2xl border border-[#bfe1d8] bg-[#edf9f5] p-4">
          <p className="font-black text-[#24755f]">✓ Votre adresse est desservie.</p>
          <p className="mt-1 text-sm text-animeo-dark">{zone.name} · consultations principalement le{zone.tourDays.length > 1 ? "s" : ""} {zone.tourDays.join(" et ").toLocaleLowerCase("fr-FR")}.</p>
          <p className="mt-3 text-sm font-extrabold text-animeo-dark">{travelFee > 0 ? `Frais de déplacement : +${travelFee} €` : "Aucun frais de déplacement"}</p>
        </div>
      ) : hasLocation ? (
        <div className="mt-5 rounded-2xl border border-[#f0d8c8] bg-[#fff7f0] p-4">
          <p className="font-black text-[#a85d32]">Cette adresse ne fait pas encore partie des zones de déplacement disponibles.</p>
          <button type="button" onClick={onSwitchToCabinet} className="mt-3 rounded-xl bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark shadow-sm">Choisir un rendez-vous au cabinet</button>
        </div>
      ) : null}

      <BookingActions onBack={onBack} nextDisabled={!zoneId} />
    </form>
  );
}
