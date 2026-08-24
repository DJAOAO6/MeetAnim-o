export type BookingMode = "CABINET" | "HOME";
export type PublicAnimalType = "Chien" | "Chat" | "Cheval" | "NAC";
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
};

export type PublicZone = {
  id: string;
  name: string;
  cities: string[];
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
  ageOrBirthDate: string;
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
    bio: "J’accompagne chiens, chats, chevaux et NAC grâce à une prise en charge adaptée à chaque animal.",
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
    ],
    zones: [
      { id: "zone-rouen", name: "Zone Rouen", cities: ["Rouen", "Bois-Guillaume", "Mont-Saint-Aignan", "Bihorel"], travelFee: 0, tourDays: ["Mardi", "Jeudi"] },
      { id: "zone-le-havre", name: "Zone Le Havre", cities: ["Le Havre", "Montivilliers", "Harfleur", "Gonfreville-l’Orcher"], travelFee: 10, tourDays: ["Lundi"] },
      { id: "zone-dieppe", name: "Zone Dieppe", cities: ["Dieppe"], travelFee: 15, tourDays: ["Vendredi"] },
    ],
  },
];

export const bookingDates: BookingDate[] = [
  { id: "2026-08-31", weekday: "Lundi", shortLabel: "31 août", fullLabel: "Lundi 31 août 2026", slots: ["09:00", "10:30", "14:00", "16:30"], zoneId: "zone-le-havre" },
  { id: "2026-09-01", weekday: "Mardi", shortLabel: "1 sept.", fullLabel: "Mardi 1 septembre 2026", slots: ["09:30", "11:00", "15:00"], zoneId: "zone-rouen" },
  { id: "2026-09-02", weekday: "Mercredi", shortLabel: "2 sept.", fullLabel: "Mercredi 2 septembre 2026", slots: ["09:00", "10:30", "14:00", "16:00"] },
  { id: "2026-09-03", weekday: "Jeudi", shortLabel: "3 sept.", fullLabel: "Jeudi 3 septembre 2026", slots: ["09:30", "11:00", "14:30", "16:00"], zoneId: "zone-rouen" },
  { id: "2026-09-04", weekday: "Vendredi", shortLabel: "4 sept.", fullLabel: "Vendredi 4 septembre 2026", slots: ["10:00", "13:30", "15:00"], zoneId: "zone-dieppe" },
];

export const occupiedAgendaSlots: Record<string, string[]> = {
  "2026-08-31": ["14:00"],
  "2026-09-01": ["11:00"],
  "2026-09-02": ["10:30"],
  "2026-09-03": ["16:00"],
};
