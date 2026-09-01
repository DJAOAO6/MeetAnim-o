import type { PublicHoursRow } from "@/lib/public-hours";

export type BookingMode = "CABINET" | "HOME";
export type PublicAnimalType = "Chien" | "Chat" | "Cheval" | "NAC" | "Petit ruminant";
export type TravelFeeMode = "none" | "fixed" | "zone";

export type PublicService = {
  id: string;
  name: string;
  description: string;
  duration: number;
  animalTypes: PublicAnimalType[];
  cabinetEnabled: boolean;
  cabinetPrice: number;
  homeEnabled: boolean;
  homePrice: number;
  travelFeeMode: TravelFeeMode;
  fixedTravelFee: number;
  // Frais de déplacement par zone pour cette prestation (mode "zone"),
  // clé = PublicZone.name — chaque prestation peut facturer différemment la
  // même zone (AUDIT_COMPLET.md P2-22), donc ce n'est pas un champ de
  // PublicZone.
  zoneFees: Record<string, number>;
  // Photo uploadée par le professionnel ; absente si aucune photo n'a été
  // choisie, auquel cas l'étape "Consultation" affiche une photo générique
  // selon animalTypes[0].
  photoUrl?: string;
};

export type PublicZone = {
  id: string;
  name: string;
  cities: string[];
  postalCodes: string[];
  tourDays: string[];
};

export type BookingDate = {
  id: string;
  weekday: string;
  shortLabel: string;
  fullLabel: string;
  slots: string[];
};

export type PublicProfessional = {
  slug: string;
  firstName: string;
  lastName: string;
  profession: string;
  company: string;
  bio: string;
  location: string;
  cabinetAddress: string;
  cabinetPostalCode: string;
  cabinetCity: string;
  cabinetLatitude: number | null;
  cabinetLongitude: number | null;
  color: string;
  logo: string;
  photo: string;
  phone: string;
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  services: PublicService[];
  zones: PublicZone[];
  // Profil public (refonte 2026-09) — voir ProfileSettings pour le détail
  // de chaque champ. Toujours transmis, la visibilité (show*Publicly) est
  // tranchée côté composants d'affichage, jamais en filtrant ici : la page
  // reste une seule source de vérité pour ce qui est réellement configuré.
  tagline: string | null;
  coverPicture: string | null;
  website: string | null;
  facebook: string | null;
  instagram: string | null;
  registrationNumber: string | null;
  acceptedPayments: string | null;
  cabinetName: string | null;
  cabinetInstructions: string | null;
  parkingInformation: string | null;
  accessibilityInformation: string | null;
  showPhonePublicly: boolean;
  showAddressPublicly: boolean;
  showHoursPublicly: boolean;
  showSocialsPublicly: boolean;
  showPaymentsPublicly: boolean;
  openingHours: PublicHoursRow[];
};

export type BookingAddress = {
  address: string;
  addressExtra: string;
  postalCode: string;
  city: string;
  // Renseignés automatiquement lors d'une sélection via l'autocomplétion
  // d'adresse (Géoplateforme IGN) ; absents pour une saisie manuelle.
  // Conservés pour les futurs usages carte/tournées/distances.
  houseNumber?: string;
  street?: string;
  citycode?: string;
  latitude?: number;
  longitude?: number;
};

export type OwnerInformation = BookingAddress & {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
};

export type AnimalInformation = {
  name: string;
  species: PublicAnimalType;
  breed: string;
  // Date de naissance structurée (ISO YYYY-MM-DD), ou "" si non renseignée.
  // birthDateApproximate signale une estimation par année seule (jour/mois
  // fixés arbitrairement au 1er juillet) plutôt qu'une date exacte connue.
  birthDate: string;
  birthDateApproximate: boolean;
  notes: string;
};

export type PublicBookingRequest = {
  id: string;
  status: "PENDING";
  professionalSlug: string;
  mode: BookingMode;
  serviceId: string;
  address?: BookingAddress;
  zoneId?: string;
  date: string;
  time: string;
  owner: OwnerInformation;
  animal: AnimalInformation;
  consultationPrice: number;
  travelFee: number;
  totalPrice: number;
  createdAt: string;
};

// Les créneaux réellement proposés viennent désormais de
// src/lib/public-schedule.ts (getPublicScheduleAction), généré à partir des
// vraies disponibilités du praticien sur une fenêtre glissante J+1 → J+90.
