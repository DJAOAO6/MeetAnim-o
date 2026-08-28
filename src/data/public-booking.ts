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
  travelFee: number;
  tourDays: string[];
};

export type BookingDate = {
  id: string;
  weekday: string;
  shortLabel: string;
  fullLabel: string;
  slots: string[];
  zoneId?: string;
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
  color: string;
  logo: string;
  photo: string;
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  services: PublicService[];
  zones: PublicZone[];
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

export const bookingProfessionals: PublicProfessional[] = [
  {
    slug: "pauline-faucillon",
    firstName: "Pauline",
    lastName: "Faucillon",
    profession: "Ostéopathe animalier",
    company: "PF Ostéo Animale",
    bio: "J’accompagne chiens, chats, chevaux, NAC et petits ruminants grâce à une prise en charge adaptée à chaque animal.",
    location: "Rouen et Normandie",
    cabinetAddress: "12 rue Exemple",
    cabinetPostalCode: "76000",
    cabinetCity: "Rouen",
    color: "#4FAF9F",
    logo: "PF",
    photo: "PF",
    cabinetAvailable: true,
    homeAvailable: true,
    services: [
      {
        id: "osteo-canine",
        name: "Ostéopathie canine",
        description: "Bilan complet et séance adaptée à votre chien.",
        duration: 60,
        animalTypes: ["Chien"],
        cabinetEnabled: true,
        cabinetPrice: 60,
        homeEnabled: true,
        homePrice: 70,
        travelFeeMode: "zone",
        fixedTravelFee: 0,
      },
      {
        id: "osteo-feline",
        name: "Ostéopathie féline",
        description: "Une prise en charge douce pour votre chat.",
        duration: 45,
        animalTypes: ["Chat"],
        cabinetEnabled: true,
        cabinetPrice: 55,
        homeEnabled: true,
        homePrice: 65,
        travelFeeMode: "fixed",
        fixedTravelFee: 10,
      },
      {
        id: "osteo-equine",
        name: "Ostéopathie équine",
        description: "Consultation directement sur le lieu de vie du cheval.",
        duration: 60,
        animalTypes: ["Cheval"],
        cabinetEnabled: false,
        cabinetPrice: 0,
        homeEnabled: true,
        homePrice: 80,
        travelFeeMode: "zone",
        fixedTravelFee: 0,
      },
      {
        id: "consultation-nac",
        name: "Consultation NAC",
        description: "Consultation pour les nouveaux animaux de compagnie.",
        duration: 45,
        animalTypes: ["NAC"],
        cabinetEnabled: true,
        cabinetPrice: 50,
        homeEnabled: true,
        homePrice: 60,
        travelFeeMode: "none",
        fixedTravelFee: 0,
      },
      {
        id: "consultation-petit-ruminant",
        name: "Consultation petit ruminant",
        description: "Bilan et séance adaptés aux chèvres, moutons et autres petits ruminants.",
        duration: 60,
        animalTypes: ["Petit ruminant"],
        cabinetEnabled: false,
        cabinetPrice: 0,
        homeEnabled: true,
        homePrice: 75,
        travelFeeMode: "zone",
        fixedTravelFee: 0,
      },
    ],
    zones: [
      { id: "zone-rouen-nord", name: "Zone Rouen Nord", cities: ["Rouen", "Bois-Guillaume", "Mont-Saint-Aignan", "Bihorel"], postalCodes: ["76000", "76130", "76230", "76420"], travelFee: 0, tourDays: ["Mardi"] },
      { id: "zone-le-havre", name: "Zone Le Havre", cities: ["Le Havre", "Montivilliers", "Harfleur", "Gonfreville-l’Orcher"], postalCodes: ["76290", "76600", "76700"], travelFee: 10, tourDays: ["Lundi"] },
      { id: "zone-dieppe", name: "Zone Dieppe", cities: ["Dieppe", "Offranville", "Rouxmesnil-Bouteilles"], postalCodes: ["76200", "76370", "76550"], travelFee: 15, tourDays: ["Vendredi"] },
    ],
  },
];

// Les créneaux réellement proposés viennent désormais de
// src/lib/public-schedule.ts (getPublicScheduleAction), généré à partir des
// vraies disponibilités du praticien sur une fenêtre glissante J+1 → J+90.
// zoneByWeekday reste ici : les tournées mises en avant dans le tunnel
// (src/data/public-booking-tours.ts) sont encore une donnée de démonstration
// distincte, non branchée sur de vraies tournées en base — voir
// AUDIT-FINDINGS.md §4. L'associer à un jour de la semaine plutôt qu'à une
// vraie zone géocodée reste donc une limite connue, pas une régression.
export const zoneByWeekday: Partial<Record<number, string>> = {
  1: "zone-le-havre",
  2: "zone-rouen-nord",
  5: "zone-dieppe",
};
