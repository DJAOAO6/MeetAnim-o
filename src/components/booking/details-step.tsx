"use client";

import { useEffect, useRef, useState, type ReactNode, type FormEvent, type KeyboardEvent } from "react";
import { BirthDatePicker } from "@/components/booking/birth-date-picker";
import { BreedCombobox } from "@/components/booking/breed-combobox";
import { BookingActions, BookingField, StepHeading, bookingErrorInputClassName, bookingFieldDescribedBy, bookingInputClassName, bookingTextareaClassName } from "@/components/booking/booking-ui";
import { AddressAutocomplete } from "@/components/ui/address-autocomplete";
import { breedFieldLabel } from "@/data/breeds";
import type { GeocodedAddress } from "@/data/geocoding";
import { computeAgeLabel } from "@/lib/animal-age";
import { getOccupiedSlotsAction } from "@/lib/appointments-actions";
import { formatBookingDateLabels, intervalsOverlap, timeToMinutes } from "@/lib/booking-validation";
import type { AnimalInformation, BookingAddress, BookingMode, OwnerInformation, PublicAnimalType, PublicProfessional, PublicService } from "@/data/public-booking";

const species: PublicAnimalType[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const phonePattern = /^[0-9+()\s.-]{6,}$/;
const REASON_MAX_WORDS = 60;

function countWords(value: string): number {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
}

// Tronque au dernier mot complet dès que la limite est dépassée, plutôt que
// de bloquer la frappe : moins de friction pour l'utilisateur qui tape vite.
function limitWords(value: string, maxWords: number): string {
  const words = value.split(/(\s+)/);
  let count = 0;
  let result = "";
  for (const token of words) {
    if (token.trim().length > 0) {
      count += 1;
      if (count > maxWords) break;
    }
    result += token;
  }
  return result;
}

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
type GroupKey = "contact" | "address" | "animal";

const groupOrder: GroupKey[] = ["contact", "address", "animal"];
const groupTitles: Record<GroupKey, string> = { contact: "Coordonnées", address: "Adresse", animal: "Votre animal" };

type DetailsStepProps = {
  professional: PublicProfessional;
  mode: BookingMode;
  service: PublicService;
  dateId: string;
  time: string;
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

export function DetailsStep({ professional, mode, service, dateId, time, owner, onOwnerChange, address, onAddressChange, zoneId, onZoneChange, animal, onAnimalChange, onBack, onNext }: DetailsStepProps) {
  const [touched, setTouched] = useState<Set<FieldKey>>(new Set());
  const [submitted, setSubmitted] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [revalidationError, setRevalidationError] = useState<string | null>(null);
  const fieldRefs = useRef<Partial<Record<FieldKey, HTMLElement | null>>>({});
  const groupContentRefs = useRef<Partial<Record<GroupKey, HTMLDivElement | null>>>({});
  const zone = professional.zones.find((item) => item.id === zoneId);
  const activeAddress = mode === "CABINET" ? owner : address;
  // Le créneau est déjà choisi à ce stade (étape précédente) : si le jour
  // choisi tombe sur un jour de passage régulier de la zone détectée, la
  // réassurance porte sur CE rendez-vous précis plutôt que sur la zone en
  // général — refonte tournées, phase 3.2 (l'adresse n'étant connue qu'à
  // cette étape depuis l'inversion de l'ordre des étapes, la mise en avant
  // ne peut plus trier/étiqueter les créneaux eux-mêmes, voir commit
  // 16acbdf ; ceci reste un message informatif après coup, jamais un filtre).
  const selectedDateWeekday = formatBookingDateLabels(dateId).weekday;
  const zoneRunsOnSelectedDate = mode === "HOME" && Boolean(zone?.tourDays.includes(selectedDateWeekday));

  function isGroupValid(group: GroupKey): boolean {
    switch (group) {
      case "contact":
        return owner.firstName.trim().length > 0 && owner.lastName.trim().length > 0 && phonePattern.test(owner.phone) && emailPattern.test(owner.email);
      case "address":
        return activeAddress.address.trim().length > 0 && activeAddress.postalCode.trim().length === 5 && activeAddress.city.trim().length > 0;
      case "animal":
        return animal.name.trim().length > 0 && animal.notes.trim().length > 0;
    }
  }

  const [openGroup, setOpenGroup] = useState<GroupKey | null>(() => groupOrder.find((group) => !isGroupValid(group)) ?? null);
  // Groupes déjà complétés une première fois : au-delà, rouvrir un groupe
  // pour corriger une erreur ne doit plus jamais provoquer sa fermeture
  // automatique au prochain blur (avant ce garde-fou, la moindre correction
  // refermait aussitôt la section, la rendant quasi impossible à corriger).
  // Seed avec les groupes déjà valides au montage (ex. retour depuis
  // l'étape suivante) pour ne pas les traiter comme "première complétion".
  // État plutôt que ref : un ref lu/écrit depuis des gestionnaires
  // eux-mêmes construits pendant le rendu (commitOnEnter, appelé dans le
  // JSX ci-dessous) déclenche react-hooks/refs, qui ne peut pas prouver
  // statiquement que la fermeture retournée n'est invoquée qu'après coup.
  const [completedGroups, setCompletedGroups] = useState<Set<GroupKey>>(() => new Set(groupOrder.filter((group) => isGroupValid(group))));
  // "unset" au tout premier rendu : le groupe déjà ouvert au montage de
  // l'étape ne doit pas voler le focus au titre de l'étape (voir l'effet
  // sur `screen` dans PublicBookingFlow) en le donnant plutôt au premier
  // champ. Comparer à la valeur précédente (mise à jour uniquement dans cet
  // effet, jamais dans un handler) distingue un vrai changement de groupe
  // d'un simple second passage causé par le double-appel des effets de
  // Strict Mode en dev — les deux passages du montage initial voient la
  // même valeur, donc aucun des deux ne déclenche le focus.
  const previousOpenGroupRef = useRef<GroupKey | null | "unset">("unset");

  useEffect(() => {
    const previousOpenGroup = previousOpenGroupRef.current;
    previousOpenGroupRef.current = openGroup;
    if (previousOpenGroup === "unset" || previousOpenGroup === openGroup || !openGroup) return;
    const container = groupContentRefs.current[openGroup];
    if (!container) return;
    const frame = requestAnimationFrame(() => {
      container.querySelector<HTMLElement>("input, select, textarea")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [openGroup]);

  // Ouvre toujours le groupe cliqué (jamais de fermeture par un second clic
  // sur son propre en-tête). Avant, un clic direct sur l'en-tête d'une
  // section pouvait la rouvrir puis la refermer aussitôt : le mousedown
  // déclenche d'abord le blur du dernier champ de la section précédente
  // (onBlur -> commit -> advanceFrom ouvre déjà la section ciblée), puis le
  // click qui suit inversait cet état ("current === group" -> ferme). Sans
  // bascule, les deux événements convergent vers le même résultat au lieu
  // de s'annuler (AUDIT_COMPLET.md P1-10).
  function toggleGroup(group: GroupKey) {
    setOpenGroup(group);
  }

  function advanceFrom(group: GroupKey) {
    if (openGroup !== group || !isGroupValid(group) || completedGroups.has(group)) return;
    setCompletedGroups((current) => new Set(current).add(group));
    setOpenGroup(groupOrder[groupOrder.indexOf(group) + 1] ?? null);
  }

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
    // onAddressChange met à jour l'état du parent : `address` (et donc
    // isGroupValid) ne reflète cette sélection qu'au prochain rendu. On
    // valide donc ici directement sur l'objet fraîchement construit plutôt
    // que sur la prop encore périmée.
    const nextIsValid = nextAddress.address.trim().length > 0 && nextAddress.postalCode.trim().length === 5 && nextAddress.city.trim().length > 0;
    if (nextIsValid && !completedGroups.has("address")) {
      setCompletedGroups((current) => new Set(current).add("address"));
      setOpenGroup((current) => (current === "address" ? groupOrder[groupOrder.indexOf("address") + 1] ?? null : current));
    }
  }

  function updateAnimal<K extends keyof AnimalInformation>(key: K, next: AnimalInformation[K]) {
    onAnimalChange({ ...animal, [key]: next });
  }

  function touch(key: FieldKey) {
    setTouched((current) => (current.has(key) ? current : new Set(current).add(key)));
  }

  function commit(key: FieldKey, group: GroupKey) {
    touch(key);
    advanceFrom(group);
  }

  function commitOnEnter(key: FieldKey, group: GroupKey) {
    return (event: KeyboardEvent<HTMLInputElement>) => {
      if (event.key === "Enter") { event.preventDefault(); commit(key, group); }
    };
  }

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

  function groupSummary(group: GroupKey): string | null {
    switch (group) {
      case "contact":
        return owner.firstName.trim() || owner.lastName.trim() ? `${owner.firstName} ${owner.lastName}`.trim() + (owner.phone.trim() ? ` · ${owner.phone.trim()}` : "") : null;
      case "address":
        return activeAddress.address.trim() ? `${activeAddress.address.trim()}${activeAddress.city.trim() ? `, ${activeAddress.city.trim()}` : ""}` : null;
      case "animal":
        return animal.name.trim() ? `${animal.name.trim()}${animal.species ? ` · ${animal.species}` : ""}` : null;
    }
  }

  // Revérifie la disponibilité du créneau à cette deuxième transition
  // (PROMPT-CALENDRIER.md §B3) : le créneau a été choisi à l'étape
  // précédente, avant que l'utilisateur ne passe du temps à remplir ce
  // formulaire — la fenêtre entre sélection et soumission finale s'étend
  // sur les deux étapes, pas seulement la première (déjà revérifiée dans
  // schedule-step.tsx, submit()).
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(true);
    const firstInvalidGroup = groupOrder.find((group) => !isGroupValid(group));
    if (firstInvalidGroup) {
      setOpenGroup(firstInvalidGroup);
      return;
    }

    setRevalidationError(null);
    setRevalidating(true);
    try {
      const freshOccupied = await getOccupiedSlotsAction(dateId, dateId);
      const stillFree = !(freshOccupied[dateId] ?? []).some((occupied) =>
        intervalsOverlap(timeToMinutes(time), service.duration, timeToMinutes(occupied.start), occupied.duration),
      );
      if (!stillFree) {
        setRevalidationError("Ce créneau vient d'être réservé par quelqu'un d'autre. Revenez à l'étape précédente pour choisir un autre horaire.");
        return;
      }
      onNext();
    } catch {
      setRevalidationError("Impossible de vérifier ce créneau pour le moment. Réessayez.");
    } finally {
      setRevalidating(false);
    }
  }

  const showAddressDetails = activeAddress.address.trim().length > 0;
  const ageLabel = computeAgeLabel({ date: animal.birthDate, approximate: animal.birthDateApproximate });

  return (
    <form onSubmit={submit} noValidate>
      <StepHeading eyebrow="Étape 3 · Vous & votre animal" title="Quelques informations" />

      <div className="mb-5 flex gap-1.5" aria-hidden="true">
        {groupOrder.map((group) => (
          <span key={group} className={`h-1 flex-1 rounded-full transition-colors motion-reduce:transition-none ${isGroupValid(group) ? "bg-animeo" : group === openGroup ? "bg-animeo/40" : "bg-[#e5eae9]"}`} />
        ))}
      </div>

      <div className="rounded-2xl border border-[#e5eae9] bg-white">
        <AccordionGroup
          groupKey="contact"
          index={0}
          title={groupTitles.contact}
          summary={groupSummary("contact")}
          isOpen={openGroup === "contact"}
          isValid={isGroupValid("contact")}
          onToggle={() => toggleGroup("contact")}
          contentRef={(node) => { groupContentRefs.current.contact = node; }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <BookingField id="booking-details-firstName" label="Prénom" required error={fieldError("firstName")}>
              <input
                id="booking-details-firstName"
                ref={(node) => { fieldRefs.current.firstName = node; }}
                value={owner.firstName}
                onChange={(event) => updateOwner("firstName", event.target.value)}
                onBlur={() => commit("firstName", "contact")}
                onKeyDown={commitOnEnter("firstName", "contact")}
                className={`${bookingInputClassName} ${fieldError("firstName") ? bookingErrorInputClassName : ""}`}
                autoComplete="given-name"
                aria-invalid={Boolean(fieldError("firstName"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-firstName", { hasError: Boolean(fieldError("firstName")) })}
              />
            </BookingField>
            <BookingField id="booking-details-lastName" label="Nom" required error={fieldError("lastName")}>
              <input
                id="booking-details-lastName"
                ref={(node) => { fieldRefs.current.lastName = node; }}
                value={owner.lastName}
                onChange={(event) => updateOwner("lastName", event.target.value)}
                onBlur={() => commit("lastName", "contact")}
                onKeyDown={commitOnEnter("lastName", "contact")}
                className={`${bookingInputClassName} ${fieldError("lastName") ? bookingErrorInputClassName : ""}`}
                autoComplete="family-name"
                aria-invalid={Boolean(fieldError("lastName"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-lastName", { hasError: Boolean(fieldError("lastName")) })}
              />
            </BookingField>
            <BookingField id="booking-details-phone" label="Téléphone" required error={fieldError("phone")}>
              <input
                id="booking-details-phone"
                ref={(node) => { fieldRefs.current.phone = node; }}
                type="tel"
                value={owner.phone}
                onChange={(event) => updateOwner("phone", event.target.value)}
                onBlur={() => commit("phone", "contact")}
                onKeyDown={commitOnEnter("phone", "contact")}
                className={`${bookingInputClassName} ${fieldError("phone") ? bookingErrorInputClassName : ""}`}
                autoComplete="tel"
                placeholder="06 12 34 56 78"
                aria-invalid={Boolean(fieldError("phone"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-phone", { hasError: Boolean(fieldError("phone")) })}
              />
            </BookingField>
            <BookingField id="booking-details-email" label="Email" required error={fieldError("email")}>
              <input
                id="booking-details-email"
                ref={(node) => { fieldRefs.current.email = node; }}
                type="email"
                value={owner.email}
                onChange={(event) => updateOwner("email", event.target.value)}
                onBlur={() => commit("email", "contact")}
                onKeyDown={commitOnEnter("email", "contact")}
                className={`${bookingInputClassName} ${fieldError("email") ? bookingErrorInputClassName : ""}`}
                autoComplete="email"
                spellCheck={false}
                placeholder="vous@exemple.fr"
                aria-invalid={Boolean(fieldError("email"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-email", { hasError: Boolean(fieldError("email")) })}
              />
            </BookingField>
          </div>
        </AccordionGroup>

        <AccordionGroup
          groupKey="address"
          index={1}
          title={groupTitles.address}
          summary={groupSummary("address")}
          isOpen={openGroup === "address"}
          isValid={isGroupValid("address")}
          onToggle={() => toggleGroup("address")}
          contentRef={(node) => { groupContentRefs.current.address = node; }}
        >
          <BookingField id="booking-details-address" label="Adresse" required error={fieldError("address")}>
            {mode === "HOME" ? (
              <AddressAutocomplete
                id="booking-details-address"
                value={address.address}
                onQueryChange={updateAddressQuery}
                onSelect={applySelectedAddress}
                placeholder="12 rue Exemple"
                ariaInvalid={Boolean(fieldError("address"))}
                ariaDescribedBy={bookingFieldDescribedBy("booking-details-address", { hasError: Boolean(fieldError("address")) })}
              />
            ) : (
              <input
                id="booking-details-address"
                ref={(node) => { fieldRefs.current.address = node; }}
                value={owner.address}
                onChange={(event) => updateOwner("address", event.target.value)}
                onBlur={() => touch("address")}
                className={`${bookingInputClassName} ${fieldError("address") ? bookingErrorInputClassName : ""}`}
                autoComplete="street-address"
                aria-invalid={Boolean(fieldError("address"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-address", { hasError: Boolean(fieldError("address")) })}
              />
            )}
          </BookingField>

          <DynamicReveal show={showAddressDetails}>
            <div className="grid gap-4 sm:grid-cols-2">
              {mode === "HOME" ? (
                <div className="sm:col-span-2">
                  <BookingField id="booking-details-addressExtra" label="Complément d’adresse" hint="Facultatif">
                    <input
                      id="booking-details-addressExtra"
                      value={address.addressExtra}
                      onChange={(event) => updateAddress("addressExtra", event.target.value)}
                      className={bookingInputClassName}
                      placeholder="Bâtiment, étage, lieu-dit…"
                      aria-describedby={bookingFieldDescribedBy("booking-details-addressExtra", { hasHint: true })}
                    />
                  </BookingField>
                </div>
              ) : null}
              <BookingField id="booking-details-postalCode" label="Code postal" required error={fieldError("postalCode")}>
                <input
                  id="booking-details-postalCode"
                  ref={(node) => { fieldRefs.current.postalCode = node; }}
                  value={activeAddress.postalCode}
                  onChange={(event) => (mode === "HOME" ? updateAddress : updateOwner)("postalCode", event.target.value.replace(/\D/g, "").slice(0, 5))}
                  onBlur={() => commit("postalCode", "address")}
                  onKeyDown={commitOnEnter("postalCode", "address")}
                  className={`${bookingInputClassName} ${fieldError("postalCode") ? bookingErrorInputClassName : ""}`}
                  inputMode="numeric"
                  maxLength={5}
                  autoComplete="postal-code"
                  placeholder="76000"
                  aria-invalid={Boolean(fieldError("postalCode"))}
                  aria-describedby={bookingFieldDescribedBy("booking-details-postalCode", { hasError: Boolean(fieldError("postalCode")) })}
                />
              </BookingField>
              <BookingField id="booking-details-city" label="Ville" required error={fieldError("city")}>
                <input
                  id="booking-details-city"
                  ref={(node) => { fieldRefs.current.city = node; }}
                  value={activeAddress.city}
                  onChange={(event) => (mode === "HOME" ? updateAddress : updateOwner)("city", event.target.value)}
                  onBlur={() => commit("city", "address")}
                  onKeyDown={commitOnEnter("city", "address")}
                  className={`${bookingInputClassName} ${fieldError("city") ? bookingErrorInputClassName : ""}`}
                  autoComplete="address-level2"
                  placeholder="Rouen"
                  aria-invalid={Boolean(fieldError("city"))}
                  aria-describedby={bookingFieldDescribedBy("booking-details-city", { hasError: Boolean(fieldError("city")) })}
                />
              </BookingField>
            </div>

            {mode === "HOME" && zone ? (
              <div className="mt-4 rounded-2xl border border-[#bfe1d8] bg-[#edf9f5] p-3.5 text-sm">
                {zoneRunsOnSelectedDate ? (
                  <p className="font-black text-[#24755f]">✓ Vous êtes déjà dans notre secteur ce jour-là — {zone.name}, passage régulier le {selectedDateWeekday.toLocaleLowerCase("fr-FR")}.</p>
                ) : (
                  <p className="font-black text-[#24755f]">✓ {zone.name} — passage régulier le{zone.tourDays.length > 1 ? "s" : ""} {zone.tourDays.join(" et ").toLocaleLowerCase("fr-FR")}</p>
                )}
              </div>
            ) : null}
          </DynamicReveal>
        </AccordionGroup>

        <AccordionGroup
          groupKey="animal"
          index={2}
          title={groupTitles.animal}
          summary={groupSummary("animal")}
          isOpen={openGroup === "animal"}
          isValid={isGroupValid("animal")}
          onToggle={() => toggleGroup("animal")}
          contentRef={(node) => { groupContentRefs.current.animal = node; }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <BookingField id="booking-details-animalName" label="Nom de l’animal" required error={fieldError("animalName")}>
              <input
                id="booking-details-animalName"
                ref={(node) => { fieldRefs.current.animalName = node; }}
                value={animal.name}
                onChange={(event) => updateAnimal("name", event.target.value)}
                onBlur={() => touch("animalName")}
                className={`${bookingInputClassName} ${fieldError("animalName") ? bookingErrorInputClassName : ""}`}
                placeholder="Luna"
                aria-invalid={Boolean(fieldError("animalName"))}
                aria-describedby={bookingFieldDescribedBy("booking-details-animalName", { hasError: Boolean(fieldError("animalName")) })}
              />
            </BookingField>
            <BookingField id="booking-details-species" label="Espèce" required>
              <select id="booking-details-species" value={animal.species} onChange={(event) => updateAnimal("species", event.target.value as PublicAnimalType)} className={bookingInputClassName}>
                {species.filter((item) => service.animalTypes.includes(item)).map((item) => <option key={item}>{item}</option>)}
              </select>
            </BookingField>
            <BookingField id="booking-details-breed" label={breedFieldLabel[animal.species]} hint="Facultatif">
              <BreedCombobox
                id="booking-details-breed"
                species={animal.species}
                value={animal.breed}
                onChange={(value) => updateAnimal("breed", value)}
                placeholder="Commencez à taper…"
                ariaDescribedBy={bookingFieldDescribedBy("booking-details-breed", { hasHint: true })}
              />
            </BookingField>
            <BookingField id="booking-details-birthDate" label="Date de naissance" hint="Facultatif">
              <BirthDatePicker
                id="booking-details-birthDate"
                value={{ date: animal.birthDate, approximate: animal.birthDateApproximate }}
                onChange={(value) => onAnimalChange({ ...animal, birthDate: value.date, birthDateApproximate: value.approximate })}
                ariaDescribedBy={bookingFieldDescribedBy("booking-details-birthDate", { hasHint: true })}
              />
              {ageLabel ? <p className="mt-1.5 text-xs font-semibold text-animeo-muted">{ageLabel}</p> : null}
            </BookingField>
            <div className="sm:col-span-2">
              <BookingField id="booking-details-reason" label="Motif de consultation" required error={fieldError("reason")}>
                <textarea
                  id="booking-details-reason"
                  ref={(node) => { fieldRefs.current.reason = node; }}
                  value={animal.notes}
                  onChange={(event) => updateAnimal("notes", limitWords(event.target.value, REASON_MAX_WORDS))}
                  onBlur={() => touch("reason")}
                  className={`${bookingTextareaClassName} ${fieldError("reason") ? bookingErrorInputClassName : ""}`}
                  placeholder="Ex. Boiterie depuis quelques jours…"
                  aria-invalid={Boolean(fieldError("reason"))}
                  aria-describedby={bookingFieldDescribedBy("booking-details-reason", { hasError: Boolean(fieldError("reason")) })}
                />
                <p className="mt-1 text-right text-xs text-animeo-muted">{countWords(animal.notes)} / {REASON_MAX_WORDS} mots</p>
              </BookingField>
            </div>
          </div>
        </AccordionGroup>
      </div>

      {revalidationError ? <p role="alert" aria-live="polite" className="mt-5 rounded-2xl bg-[#fff1f1] p-3 text-sm font-bold text-[#a9573b]">{revalidationError}</p> : null}
      <BookingActions onBack={onBack} loading={revalidating} />
    </form>
  );
}

function AccordionGroup({ groupKey, index, title, summary, isOpen, isValid, onToggle, contentRef, children }: {
  groupKey: GroupKey;
  index: number;
  title: string;
  summary: string | null;
  isOpen: boolean;
  isValid: boolean;
  onToggle: () => void;
  contentRef: (node: HTMLDivElement | null) => void;
  children: ReactNode;
}) {
  const headerId = `booking-details-header-${groupKey}`;
  const panelId = `booking-details-panel-${groupKey}`;

  return (
    <div className="border-b border-[#e5eae9] px-4 last:border-b-0 sm:px-5">
      <button
        type="button"
        id={headerId}
        onClick={onToggle}
        aria-expanded={isOpen}
        aria-controls={panelId}
        className="flex w-full touch-manipulation items-center justify-between gap-3 rounded-lg py-3.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-1"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black transition motion-reduce:transition-none ${
            isValid ? "bg-animeo text-white" : isOpen ? "border-2 border-animeo text-animeo-dark" : "bg-[#eef1f1] text-animeo-muted"
          }`}>
            {isValid ? <CheckMark /> : index + 1}
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-extrabold text-animeo-dark">{title}</span>
            {!isOpen && summary ? <span className="block truncate text-xs text-animeo-muted">{summary}</span> : null}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-animeo-muted transition-transform motion-reduce:transition-none ${isOpen ? "rotate-180" : ""}`} />
      </button>
      <div
        id={panelId}
        role="region"
        aria-labelledby={headerId}
        inert={!isOpen}
        className="grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr", overflow: isOpen ? "visible" : "hidden" }}
      >
        <div ref={contentRef} className="min-h-0">
          <div className="pb-5">{children}</div>
        </div>
      </div>
    </div>
  );
}

function DynamicReveal({ show, children }: { show: boolean; children: ReactNode }) {
  return (
    <div className="grid transition-[grid-template-rows] duration-[250ms] ease-out motion-reduce:transition-none" style={{ gridTemplateRows: show ? "1fr" : "0fr" }}>
      <div className="overflow-hidden">
        <div className="pt-4">{children}</div>
      </div>
    </div>
  );
}

function CheckMark() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
