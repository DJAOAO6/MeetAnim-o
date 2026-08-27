export type AnimalType = "Chien" | "Chat" | "Cheval" | "NAC" | "Petit ruminant";

export type ProfileSettings = {
  firstName: string;
  lastName: string;
  profession: string;
  company: string;
  phone: string;
  email: string;
  address: string;
  postalCode: string;
  city: string;
  location: string;
  bio: string;
  slug: string;
  photo: string;
  logo: string;
};

export type TravelFeeMode = "fixed" | "zone" | "kilometric";

export type ServiceSettings = {
  id: string;
  name: string;
  description: string;
  duration: number;
  animals: AnimalType[];
  cabinetEnabled: boolean;
  cabinetPrice: number;
  homeEnabled: boolean;
  homePrice: number;
  travelFeesEnabled: boolean;
  travelFeeMode: TravelFeeMode;
  fixedTravelFee: number;
  zoneFees: Record<string, number>;
  kilometricRate: number;
  suggestedReminder: "3 mois" | "6 mois" | "12 mois" | "Aucun";
  active: boolean;
  // Photo uploadée par le professionnel (data URI) ; absente si aucune photo
  // n'a encore été choisie, auquel cas une photo générique par espèce est
  // utilisée à l'affichage.
  photoUrl: string | null;
};

export type TimeSlot = {
  id: string;
  start: string;
  end: string;
  cabinet: boolean;
  home: boolean;
};

export type DayAvailability = {
  id: string;
  label: string;
  enabled: boolean;
  slots: TimeSlot[];
};

export type ExceptionalClosure = {
  id: string;
  date: string;
  start: string;
  end: string;
  scope: "Cabinet uniquement" | "Domicile uniquement" | "Tout fermer";
  reason: string;
};

export type Vacation = {
  id: string;
  startDate: string;
  endDate: string;
};

export type AvailabilitySettings = {
  days: DayAvailability[];
  travelBuffer: number;
  closures: ExceptionalClosure[];
  vacations: Vacation[];
};

export type ReminderSettings = {
  defaultDelay: "3 mois" | "6 mois" | "12 mois" | "Aucun";
  messageTemplate: string;
  appointmentReminderEnabled: boolean;
  appointmentReminderDelay: "24 heures avant" | "48 heures avant";
};

export type SettingsState = {
  profile: ProfileSettings;
  services: ServiceSettings[];
  availability: AvailabilitySettings;
  reminders: ReminderSettings;
  publicColor: string;
  kilometricFeesEnabled: boolean;
};

const defaultZoneFees = { Rouen: 0, "Le Havre": 10, Dieppe: 15 };

export const initialSettings: SettingsState = {
  profile: {
    firstName: "Pauline",
    lastName: "Faucillon",
    profession: "Ostéopathe animalier",
    company: "PF Ostéo Animale",
    phone: "06 12 34 56 78",
    email: "pauline@pf-osteo-animale.fr",
    address: "24 rue des Carmes",
    postalCode: "76000",
    city: "Rouen",
    location: "Rouen et Normandie",
    bio: "J’accompagne chiens, chats et chevaux avec une approche douce et personnalisée.",
    slug: "pauline-faucillon",
    photo: "PF",
    logo: "PF",
  },
  services: [
    {
      id: "service-osteo-canine",
      name: "Ostéopathie canine",
      description: "Bilan complet et séance d’ostéopathie pour chien.",
      duration: 60,
      animals: ["Chien"],
      cabinetEnabled: true,
      cabinetPrice: 60,
      homeEnabled: true,
      homePrice: 70,
      travelFeesEnabled: true,
      travelFeeMode: "zone",
      fixedTravelFee: 10,
      zoneFees: { ...defaultZoneFees },
      kilometricRate: 0.6,
      suggestedReminder: "6 mois",
      active: true,
      photoUrl: null,
    },
    {
      id: "service-osteo-equine",
      name: "Ostéopathie équine",
      description: "Consultation à domicile adaptée au cheval.",
      duration: 90,
      animals: ["Cheval"],
      cabinetEnabled: false,
      cabinetPrice: 0,
      homeEnabled: true,
      homePrice: 90,
      travelFeesEnabled: true,
      travelFeeMode: "fixed",
      fixedTravelFee: 15,
      zoneFees: { ...defaultZoneFees },
      kilometricRate: 0.6,
      suggestedReminder: "6 mois",
      active: true,
      photoUrl: null,
    },
    {
      id: "service-massage-canin",
      name: "Massage canin",
      description: "Massage de détente et récupération musculaire.",
      duration: 45,
      animals: ["Chien"],
      cabinetEnabled: true,
      cabinetPrice: 50,
      homeEnabled: true,
      homePrice: 55,
      travelFeesEnabled: false,
      travelFeeMode: "fixed",
      fixedTravelFee: 0,
      zoneFees: { ...defaultZoneFees },
      kilometricRate: 0.6,
      suggestedReminder: "3 mois",
      active: true,
      photoUrl: null,
    },
  ],
  availability: {
    travelBuffer: 30,
    days: [
      { id: "monday", label: "Lundi", enabled: true, slots: [
        { id: "mon-1", start: "09:00", end: "12:00", cabinet: true, home: true },
        { id: "mon-2", start: "14:00", end: "18:00", cabinet: false, home: true },
      ] },
      { id: "tuesday", label: "Mardi", enabled: true, slots: [{ id: "tue-1", start: "09:00", end: "17:00", cabinet: true, home: true }] },
      { id: "wednesday", label: "Mercredi", enabled: true, slots: [{ id: "wed-1", start: "09:00", end: "18:00", cabinet: true, home: false }] },
      { id: "thursday", label: "Jeudi", enabled: true, slots: [{ id: "thu-1", start: "09:00", end: "18:00", cabinet: false, home: true }] },
      { id: "friday", label: "Vendredi", enabled: true, slots: [{ id: "fri-1", start: "09:00", end: "16:00", cabinet: true, home: true }] },
      { id: "saturday", label: "Samedi", enabled: false, slots: [] },
      { id: "sunday", label: "Dimanche", enabled: false, slots: [] },
    ],
    closures: [
      { id: "closure-1", date: "2026-09-14", start: "14:00", end: "18:00", scope: "Cabinet uniquement", reason: "Formation" },
    ],
    vacations: [],
  },
  reminders: {
    defaultDelay: "6 mois",
    messageTemplate: "Bonjour [Prénom],\n\nCela fait bientôt [Durée] depuis la dernière séance de [Animal].\n\nSi vous souhaitez prévoir une nouvelle consultation, vous pouvez prendre rendez-vous ici :\n\n[Lien de réservation]",
    appointmentReminderEnabled: true,
    appointmentReminderDelay: "24 heures avant",
  },
  publicColor: "#4FAF9F",
  kilometricFeesEnabled: false,
};

export const serviceZoneNames = ["Rouen", "Le Havre", "Dieppe"];
