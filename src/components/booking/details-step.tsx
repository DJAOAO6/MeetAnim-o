"use client";

import { useRef, useState, type FormEvent } from "react";
import { AddressAutocomplete } from "@/components/booking/address-autocomplete";
import { BookingActions, BookingField, StepHeading, bookingErrorInputClassName, bookingInputClassName, bookingTextareaClassName } from "@/components/booking/booking-ui";
import type { GeocodedAddress } from "@/data/geocoding";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicAnimalType, PublicProfessional, PublicService } from "@/data/public-booking";

const species: PublicAnimalType[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+()\s.-]{6,}$/;

function normalizeCity(value: string) {
  return value.trim().toLocaleLowerCase("fr-FR").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/[’']/g, "'");
}

function findMatchingZone(professional: PublicProfessional, address: BookingAddress) {
  const normalizedCity = normalizeCity(address.city);
  const normalizedPostalCode = address.postalCode.replace(/\s/g, "");

  return professional.zones.find((item) =>
    item.cities.some((city) => normalizeCity(city) === normalizedCity)
    || (normalizedPostalCode.length === 5 && item.postalCodes.includes(normalizedPostalCode)),
  );
}

type FieldKey = "firstName" | "lastName" | "phone" | "email" | "address" | "postalCode" | "city" | "animalName" | "reason";

type DetailsStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  owner: OwnerInformation;
  onOwnerChange: (value: OwnerInformation) => void;
  address: BookingAddress;
  onAddressChange: (value: BookingAddress) => void;
  zoneId: string | null;
  onZoneChange: (zoneId: string | null) => void;
  animal: AnimalInformation;
  onAnimalChange: (value: AnimalInformation) => void;
  onBack: () => void;
  onNext: () => void;
};

export function DetailsStep({ professional, mode, service, owner, onOwnerChange, address, onAddressChange, zoneId, onZoneChange, animal, onAnimalChange, onBack, onNext }: DetailsStepProps) {
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const zone = professional.zones.find((item) => item.id === zoneId);

  function updateOwner(key: keyof OwnerInformation, next: string) {
    onOwnerChange({ ...owner, [key]: next });
  }

  function updateAddress(key: keyof BookingAddress, next: string) {
    const nextAddress = { ...address, [key]: next };
    onAddressChange(nextAddress);
    onZoneChange(findMatchingZone(professional, nextAddress)?.id ?? null);
  }

  function updateAddressQuery(next: string) {
    const nextAddress: BookingAddress = address.latitude !== undefined
      ? { ...address, address: next, houseNumber: undefined, street: undefined, citycode: undefined, latitude: undefined, longitude: undefined }
      : { ...address, address: next };
    onAddressChange(nextAddress);
    onZoneChange(findMatchingZone(professional, nextAddress)?.id ?? null);
  }

  function applySelectedAddress(result: GeocodedAddress) {
    const nextAddress: BookingAddress = {
      ...address,
      address: result.label,
      postalCode: result.postcode,
      city: result.city,
      houseNumber: result.houseNumber,
      street: result.street,
      citycode: result.citycode,
      latitude: result.latitude,
      longitude: result.longitude,
    };
    onAddressChange(nextAddress);
    onZoneChange(findMatchingZone(professional, nextAddress)?.id ?? null);
  }

  function updateAnimal<K extends keyof AnimalInformation>(key: K, next: AnimalInformation[K]) {
    onAnimalChange({ ...animal, [key]: next });
  }

  function touch(key: FieldKey) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  const activeAddress = mode === "CABINET" ? owner : address;

  function fieldError(key: FieldKey): string | null {
    if (!submitted && !touched.has(key)) return null;
    switch (key) {
      case "firstName": return owner.firstName.trim() ? null : "Champ requis";
      case "lastName": return owner.lastName.trim() ? null : "Champ requis";
      case "phone": return !owner.phone.trim() ? "Champ requis" : !phonePattern.test(owner.phone) ? "Numéro invalide" : null;
      case "email": return !owner.email.trim() ? "Champ requis" : !emailPattern.test(owner.email) ? "Email invalide" : null;
      case "address": return activeAddress.address.trim() ? null : "Champ requis";
      case "postalCode": return activeAddress.postalCode.trim().length === 5 ? null : "5 chiffres requis";
      case "city": return activeAddress.city.trim() ? null : "Champ requis";
      case "animalName": return animal.name.trim() ? null : "Champ requis";
      case "reason": return animal.notes.trim() ? null : "Champ requis";
    }
  }

  const requiredKeys: FieldKey[] = ["firstName", "lastName", "phone", "email", "address", "postalCode", "city", "animalName", "reason"];

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const firstInvalid = requiredKeys.find((key) => fieldErrorForSubmit(key));
    if (firstInvalid) {
      fieldRefs.current[firstInvalid]?.focus();
      return;
    }
    onNext();

    function fieldErrorForSubmit(key: FieldKey): boolean {
      switch (key) {
        case "firstName": return !owner.firstName.trim();
        case "lastName": return !owner.lastName.trim();
        case "phone": return !owner.phone.trim() || !phonePattern.test(owner.phone);
        case "email": return !owner.email.trim() || !emailPattern.test(owner.email);
        case "address": return !activeAddress.address.trim();
        case "postalCode": return activeAddress.postalCode.trim().length !== 5;
        case "city": return !activeAddress.city.trim();
        case "animalName": return !animal.name.trim();
        case "reason": return !animal.notes.trim();
      }
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading eyebrow="Étape 2 · Vous & votre animal" title="Quelques informations" />

      <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Vos coordonnées</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <BookingField label="Prénom" required error={fieldError("firstName")}>
          <input
            ref={(node) => { fieldRefs.current.firstName = node; }}
            value={owner.firstName}
            onChange={(event) => updateOwner("firstName", event.target.value)}
            onBlur={() => touch("firstName")}
            className={`${bookingInputClassName} ${fieldError("firstName") ? bookingErrorInputClassName : ""}`}
            autoComplete="given-name"
          />
        </BookingField>
        <BookingField label="Nom" required error={fieldError("lastName")}>
          <input
            ref={(node) => { fieldRefs.current.lastName = node; }}
            value={owner.lastName}
            onChange={(event) => updateOwner("lastName", event.target.value)}
            onBlur={() => touch("lastName")}
            className={`${bookingInputClassName} ${fieldError("lastName") ? bookingErrorInputClassName : ""}`}
            autoComplete="family-name"
          />
        </BookingField>
        <BookingField label="Téléphone" required error={fieldError("phone")}>
          <input
            ref={(node) => { fieldRefs.current.phone = node; }}
            type="tel"
            value={owner.phone}
            onChange={(event) => updateOwner("phone", event.target.value)}
            onBlur={() => touch("phone")}
            className={`${bookingInputClassName} ${fieldError("phone") ? bookingErrorInputClassName : ""}`}
            autoComplete="tel"
            placeholder="06 12 34 56 78"
          />
        </BookingField>
        <BookingField label="Email" required error={fieldError("email")}>
          <input
            ref={(node) => { fieldRefs.current.email = node; }}
            type="email"
            value={owner.email}
            onChange={(event) => updateOwner("email", event.target.value)}
            onBlur={() => touch("email")}
            className={`${bookingInputClassName} ${fieldError("email") ? bookingErrorInputClassName : ""}`}
            autoComplete="email"
            spellCheck={false}
            placeholder="vous@exemple.fr"
          />
        </BookingField>
      </div>

      <p className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">{mode === "HOME" ? "Adresse de la consultation" : "Votre adresse"}</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <BookingField label="Adresse" required error={fieldError("address")}>
            {mode === "HOME" ? (
              <AddressAutocomplete
                value={address.address}
                onQueryChange={updateAddressQuery}
                onSelect={applySelectedAddress}
                placeholder="12 rue Exemple"
              />
            ) : (
              <input
                ref={(node) => { fieldRefs.current.address = node; }}
                value={owner.address}
                onChange={(event) => updateOwner("address", event.target.value)}
                onBlur={() => touch("address")}
                className={`${bookingInputClassName} ${fieldError("address") ? bookingErrorInputClassName : ""}`}
                autoComplete="street-address"
              />
            )}
          </BookingField>
        </div>
        {mode === "HOME" ? (
          <div className="sm:col-span-2"><BookingField label="Complément d’adresse" hint="Facultatif"><input value={address.addressExtra} onChange={(event) => updateAddress("addressExtra", event.target.value)} className={bookingInputClassName} placeholder="Bâtiment, étage, lieu-dit…" /></BookingField></div>
        ) : null}
        <BookingField label="Code postal" required error={fieldError("postalCode")}>
          <input
            ref={(node) => { fieldRefs.current.postalCode = node; }}
            value={activeAddress.postalCode}
            onChange={(event) => (mode === "HOME" ? updateAddress : updateOwner)("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))}
            onBlur={() => touch("postalCode")}
            className={`${bookingInputClassName} ${fieldError("postalCode") ? bookingErrorInputClassName : ""}`}
            inputMode="numeric"
            maxLength={5}
            autoComplete="postal-code"
            placeholder="76000"
          />
        </BookingField>
        <BookingField label="Ville" required error={fieldError("city")}>
          <input
            ref={(node) => { fieldRefs.current.city = node; }}
            value={activeAddress.city}
            onChange={(event) => (mode === "HOME" ? updateAddress : updateOwner)("city", event.target.value)}
            onBlur={() => touch("city")}
            className={`${bookingInputClassName} ${fieldError("city") ? bookingErrorInputClassName : ""}`}
            autoComplete="address-level2"
            placeholder="Rouen"
          />
        </BookingField>
      </div>

      {mode === "HOME" && zone ? (
        <div className="mt-4 rounded-2xl border border-[#bfe1d8] bg-[#edf9f5] p-4 text-sm">
          <p className="font-black text-[#24755f]">✓ Une tournée passe régulièrement par votre secteur</p>
          <p className="mt-1 text-animeo-dark">{zone.name} · le{zone.tourDays.length > 1 ? "s" : ""} {zone.tourDays.join(" et ").toLocaleLowerCase("fr-FR")} — sans limiter les autres créneaux disponibles.</p>
        </div>
      ) : null}

      <p className="mb-3 mt-6 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Votre animal</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <BookingField label="Nom de l’animal" required error={fieldError("animalName")}>
          <input
            ref={(node) => { fieldRefs.current.animalName = node; }}
            value={animal.name}
            onChange={(event) => updateAnimal("name", event.target.value)}
            onBlur={() => touch("animalName")}
            className={`${bookingInputClassName} ${fieldError("animalName") ? bookingErrorInputClassName : ""}`}
            placeholder="Luna"
          />
        </BookingField>
        <BookingField label="Espèce" required>
          <select value={animal.species} onChange={(event) => updateAnimal("species", event.target.value as PublicAnimalType)} className={bookingInputClassName}>
            {species.filter((item) => service.animalTypes.includes(item)).map((item) => <option key={item}>{item}</option>)}
          </select>
        </BookingField>
        <BookingField label="Race" hint="Facultatif"><input value={animal.breed} onChange={(event) => updateAnimal("breed", event.target.value)} className={bookingInputClassName} placeholder="Golden Retriever" /></BookingField>
        <BookingField label="Âge ou date de naissance" hint="Facultatif"><input value={animal.ageOrBirthDate} onChange={(event) => updateAnimal("ageOrBirthDate", event.target.value)} className={bookingInputClassName} placeholder="5 ans ou 12/04/2021" /></BookingField>
        <div className="sm:col-span-2">
          <BookingField label="Motif de consultation" required error={fieldError("reason")}>
            <textarea
              ref={(node) => { fieldRefs.current.reason = node; }}
              value={animal.notes}
              onChange={(event) => updateAnimal("notes", event.target.value)}
              onBlur={() => touch("reason")}
              className={`${bookingTextareaClassName} ${fieldError("reason") ? bookingErrorInputClassName : ""}`}
              placeholder="Ex. Boiterie depuis quelques jours…"
            />
          </BookingField>
        </div>
      </div>

      <BookingActions onBack={onBack} />
    </form>
  );
}
