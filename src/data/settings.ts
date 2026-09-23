import type { PracticeMode } from "@/lib/practice-mode";

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
  // Page publique de réservation — profil public (refonte 2026-09). `bio`
  // ci-dessus est le contenu détaillé de "À propos" ; tagline est le texte
  // très court affiché dans le bandeau d'en-tête, jamais le même texte aux
  // deux endroits.
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
  /** Voir src/lib/practice-mode.ts : permanent, distinct d'une fermeture. */
  practiceMode: PracticeMode;
  /** Point de départ des tournées quand il n'y a pas de cabinet. Privé. */
  departureLabel: string | null;
  departureAddress: string | null;
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

export type ClosureScope = "Cabinet uniquement" | "Domicile uniquement" | "Tout fermer";

/**
 * Fermeture exceptionnelle : une période pendant laquelle les clients ne
 * peuvent pas réserver, le cabinet, le domicile ou les deux.
 *
 * `date` est le premier jour, `endDate` le dernier (absent = une seule
 * journée) : une fermeture du 25/09 au 02/10 est donc une seule ligne, et
 * elle cesse de s'appliquer d'elle-même passé sa date de fin — la
 * réouverture est automatique par construction, sans tâche de fond.
 *
 * `start`/`end` bornent les heures concernées dans chacune de ces journées :
 * une fermeture d'une semaine entière va simplement de 00:00 à 23:59.
 */
export type ExceptionalClosure = {
  id: string;
  date: string;
  /** Dernier jour inclus. Absent : la fermeture ne dure qu'un jour. */
  endDate?: string;
  start: string;
  end: string;
  scope: ClosureScope;
  reason: string;
};

export type Vacation = {
  id: string;
  startDate: string;
  endDate: string;
};

export type AvailabilitySettings = {
  days: DayAvailability[];
  /**
   * Message affiché aux visiteurs sur la page de réservation (300 caractères
   * au plus). Vide = rien n'est affiché, plutôt qu'un encart inutile.
   */
  publicMessage?: string;
  travelBuffer: number;
  closures: ExceptionalClosure[];
  vacations: Vacation[];
  // Valeur pré-remplie à la création d'une nouvelle prestation (Prestations) —
  // chaque prestation reste ensuite librement modifiable individuellement,
  // ceci n'est qu'un point de départ.
  defaultAppointmentDuration: number;
  // Granularité de la grille horaire proposée (créneaux alignés sur ce pas,
  // ex. 9h00/9h15/9h30…), indépendamment de la durée de la prestation
  // choisie — utilisé par generateCandidateStarts (booking-validation.ts).
  // 0 = "Désactivé" : les créneaux s'enchaînent sur la durée de la
  // prestation elle-même plutôt que sur une grille fixe.
  slotInterval: number;
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

// Plus de valeurs par défaut par nom de zone : les zones réelles sont
// configurées dans Tournées, pas connues statiquement ici — AUDIT_COMPLET.md
// P2-22. Une prestation en mode "zone" démarre donc sans frais tant que le
// praticien ne les a pas saisis pour ses zones réelles dans ServiceModal.
const defaultZoneFees: Record<string, number> = {};

export const initialSettings: SettingsState = {
  // Toujours remplacé par le profil réel du cabinet à l'affichage : vide,
  // pour qu'aucune identité ne puisse apparaître par défaut.
  profile: {
    firstName: "",
    lastName: "",
    profession: "",
    company: "",
    phone: "",
    email: "",
    address: "",
    postalCode: "",
    city: "",
    location: "",
    bio: "",
    slug: "",
    photo: "",
    logo: "",
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
    defaultAppointmentDuration: 45,
    slotInterval: 15,
  },
  reminders: {
    defaultDelay: "6 mois",
    messageTemplate: "Bonjour [Prénom],\n\nCela fait bientôt [Durée] depuis la dernière séance de [Animal].\n\nSi vous souhaitez prévoir une nouvelle consultation, vous pouvez prendre rendez-vous ici :\n\n[Lien de réservation]",
    appointmentReminderEnabled: true,
    appointmentReminderDelay: "24 heures avant",
  },
  publicColor: "#2F7A6E",
  kilometricFeesEnabled: false,
};
