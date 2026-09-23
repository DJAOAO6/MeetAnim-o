import { randomBytes } from "node:crypto";
import type { BusinessProfileData } from "@/lib/business-profile-actions";
import type { AvailabilitySettings, DayAvailability } from "@/data/settings";

/**
 * Profil d'un cabinet qui vient d'ouvrir : l'identité donnée à
 * l'inscription, et rien d'autre — pas d'adresse, de téléphone ni de
 * présentation empruntés à quelqu'un d'autre. L'onboarding le complète.
 *
 * Sans lien fourni, un lien provisoire et unique : le vrai se choisit à la
 * dernière étape de l'onboarding.
 */
export function blankProfile(identity: Partial<Pick<BusinessProfileData, "firstName" | "lastName" | "company" | "email" | "slug">> = {}): BusinessProfileData {
  const firstName = identity.firstName ?? "";
  const lastName = identity.lastName ?? "";
  const initials = `${firstName.charAt(0)}${lastName.charAt(0)}`.toLocaleUpperCase("fr-FR");
  return {
    firstName,
    lastName,
    profession: "",
    company: identity.company ?? "",
    phone: "",
    email: identity.email ?? "",
    address: "",
    postalCode: "",
    city: "",
    location: "",
    bio: "",
    slug: identity.slug ?? `cabinet-${randomBytes(4).toString("hex")}`,
    photo: initials,
    logo: initials,
    publicColor: "#2F7A6E",
    cabinetAvailable: true,
    homeAvailable: true,
    latitude: null,
    longitude: null,
    tagline: null,
    coverPicture: null,
    website: null,
    facebook: null,
    instagram: null,
    registrationNumber: null,
    acceptedPayments: null,
    cabinetName: null,
    cabinetInstructions: null,
    parkingInformation: null,
    accessibilityInformation: null,
    showPhonePublicly: true,
    showAddressPublicly: true,
    showHoursPublicly: true,
    showSocialsPublicly: true,
    showPaymentsPublicly: true,
    practiceMode: "BOTH",
    departureLabel: null,
    departureAddress: null,
    departureLatitude: null,
    departureLongitude: null,
  };
}

/**
 * Horaires d'un cabinet qui vient d'ouvrir : du lundi au vendredi, 9 h-12 h
 * et 14 h-18 h, sans fermeture ni congés. Un point de départ, pas un
 * engagement — l'onboarding les fait confirmer ou changer avant l'ouverture
 * de la page de réservation.
 */
export function blankAvailability(): AvailabilitySettings {
  const weekday = (id: string, label: string): DayAvailability => ({
    id,
    label,
    enabled: true,
    slots: [
      { id: `${id}-1`, start: "09:00", end: "12:00", cabinet: true, home: true },
      { id: `${id}-2`, start: "14:00", end: "18:00", cabinet: true, home: true },
    ],
  });
  return {
    days: [
      weekday("monday", "Lundi"),
      weekday("tuesday", "Mardi"),
      weekday("wednesday", "Mercredi"),
      weekday("thursday", "Jeudi"),
      weekday("friday", "Vendredi"),
      { id: "saturday", label: "Samedi", enabled: false, slots: [] },
      { id: "sunday", label: "Dimanche", enabled: false, slots: [] },
    ],
    travelBuffer: 30,
    closures: [],
    vacations: [],
    defaultAppointmentDuration: 60,
    slotInterval: 30,
  };
}
