"use client";

import type { FormEvent } from "react";
import { BookingActions, BookingField, StepHeading, bookingInputClassName, bookingTextareaClassName } from "@/components/booking/booking-ui";
import type { AnimalInformation, BookingMode, OwnerInformation, PublicAnimalType, PublicService } from "@/data/public-booking";

type OwnerStepProps = {
  mode: BookingMode;
  value: OwnerInformation;
  onChange: (value: OwnerInformation) => void;
  onBack: () => void;
  onNext: () => void;
};

export function OwnerStep({ mode, value, onChange, onBack, onNext }: OwnerStepProps) {
  function update(key: keyof OwnerInformation, next: string) {
    onChange({ ...value, [key]: next });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 3 · Informations" title="Commençons par vos informations" description="Votre adresse et vos coordonnées nous permettent de vous proposer les créneaux les plus cohérents avec votre secteur." />
      <div className="grid gap-4 sm:grid-cols-2">
        <BookingField label="Prénom" required><input value={value.firstName} onChange={(event) => update("firstName", event.target.value)} className={bookingInputClassName} autoComplete="given-name" required /></BookingField>
        <BookingField label="Nom" required><input value={value.lastName} onChange={(event) => update("lastName", event.target.value)} className={bookingInputClassName} autoComplete="family-name" required /></BookingField>
        <BookingField label="Téléphone" required><input type="tel" value={value.phone} onChange={(event) => update("phone", event.target.value)} className={bookingInputClassName} autoComplete="tel" placeholder="06 12 34 56 78" required /></BookingField>
        <BookingField label="Email" required><input type="email" value={value.email} onChange={(event) => update("email", event.target.value)} className={bookingInputClassName} autoComplete="email" placeholder="vous@exemple.fr" required /></BookingField>
        {mode === "CABINET" ? (
          <>
            <div className="sm:col-span-2"><BookingField label="Votre adresse" required><input value={value.address} onChange={(event) => update("address", event.target.value)} className={bookingInputClassName} autoComplete="street-address" required /></BookingField></div>
            <BookingField label="Code postal" required><input value={value.postalCode} onChange={(event) => update("postalCode", event.target.value)} className={bookingInputClassName} inputMode="numeric" autoComplete="postal-code" required /></BookingField>
            <BookingField label="Ville" required><input value={value.city} onChange={(event) => update("city", event.target.value)} className={bookingInputClassName} autoComplete="address-level2" required /></BookingField>
          </>
        ) : (
          <div className="sm:col-span-2 rounded-2xl bg-animeo-soft p-4 text-sm leading-6 text-animeo-dark"><strong>Consultation à domicile</strong><br /><span className="text-animeo-muted">Votre adresse sera vérifiée à l’étape suivante pour identifier votre zone et les tournées qui passent près de chez vous.</span></div>
        )}
      </div>
      <p className="mt-4 text-xs text-animeo-muted"><span className="text-[#b65f43]">*</span> Champs obligatoires</p>
      <BookingActions onBack={onBack} />
    </form>
  );
}

type AnimalStepProps = {
  service: PublicService;
  value: AnimalInformation;
  onChange: (value: AnimalInformation) => void;
  onBack: () => void;
  onNext: () => void;
};

const species: PublicAnimalType[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];

export function AnimalStep({ service, value, onChange, onBack, onNext }: AnimalStepProps) {
  function update<K extends keyof AnimalInformation>(key: K, next: AnimalInformation[K]) {
    onChange({ ...value, [key]: next });
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onNext();
  }

  return (
    <form onSubmit={submit}>
      <StepHeading eyebrow="Étape 3 · Informations" title="Votre animal" description={`Quelques informations utiles pour préparer la prestation « ${service.name} » avant de chercher le meilleur créneau.`} />
      <div className="grid gap-4 sm:grid-cols-2">
        <BookingField label="Nom de l’animal" required><input value={value.name} onChange={(event) => update("name", event.target.value)} className={bookingInputClassName} placeholder="Luna" required /></BookingField>
        <BookingField label="Espèce" required><select value={value.species} onChange={(event) => update("species", event.target.value as PublicAnimalType)} className={bookingInputClassName}>{species.map((item) => <option key={item}>{item}</option>)}</select></BookingField>
        <BookingField label="Race" hint="Facultatif"><input value={value.breed} onChange={(event) => update("breed", event.target.value)} className={bookingInputClassName} placeholder="Golden Retriever" /></BookingField>
        <BookingField label="Âge ou date de naissance" hint="Facultatif"><input value={value.ageOrBirthDate} onChange={(event) => update("ageOrBirthDate", event.target.value)} className={bookingInputClassName} placeholder="5 ans ou 12/04/2021" /></BookingField>
        <div className="sm:col-span-2"><BookingField label="Informations utiles pour le professionnel" hint="Facultatif"><textarea value={value.notes} onChange={(event) => update("notes", event.target.value)} className={bookingTextareaClassName} placeholder="Ex. Boiterie depuis quelques jours." /></BookingField></div>
      </div>
      <BookingActions onBack={onBack} nextLabel="Voir le récapitulatif" />
    </form>
  );
}
