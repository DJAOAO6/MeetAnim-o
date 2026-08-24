export type City = {
  id: string;
  name: string;
  postalCode: string;
};

export type Zone = {
  id: string;
  name: string;
  cities: City[];
};

export type TourStatus = "Active" | "Inactive";

export type Tour = {
  id: string;
  name: string;
  recurrence: "Toutes les semaines" | "Une seule fois";
  day: string;
  dateLabel: string;
  startTime: string;
  endTime: string;
  zoneId: string;
  status: TourStatus;
  appointmentCount: number;
  estimatedKm: number;
  consultationHours: string;
};

export type TourAppointment = {
  id: string;
  time: string;
  animalName: string;
  service: string;
  city: string;
  clientName: string;
  position: { x: number; y: number };
};

export type AnimalSpecies = "Chien" | "Chat" | "Cheval" | "NAC";

export type MapClient = {
  id: string;
  clientId: string;
  ownerName: string;
  animalName: string;
  species: AnimalSpecies;
  breed: string;
  city: string;
  lastConsultation: string;
  nextReminder: string;
  dueForReminder: boolean;
  avatar: string;
  position: { x: number; y: number };
};

export const initialZones: Zone[] = [
  {
    id: "zone-le-havre",
    name: "Zone Le Havre",
    cities: [
      { id: "le-havre", name: "Le Havre", postalCode: "76600" },
      { id: "montivilliers", name: "Montivilliers", postalCode: "76290" },
      { id: "harfleur", name: "Harfleur", postalCode: "76700" },
      { id: "gonfreville", name: "Gonfreville-l’Orcher", postalCode: "76700" },
    ],
  },
  {
    id: "zone-rouen-nord",
    name: "Zone Rouen Nord",
    cities: [
      { id: "rouen", name: "Rouen", postalCode: "76000" },
      { id: "bois-guillaume", name: "Bois-Guillaume", postalCode: "76230" },
      { id: "mont-saint-aignan", name: "Mont-Saint-Aignan", postalCode: "76130" },
      { id: "bihorel", name: "Bihorel", postalCode: "76420" },
    ],
  },
  {
    id: "zone-dieppe",
    name: "Zone Dieppe",
    cities: [
      { id: "dieppe", name: "Dieppe", postalCode: "76200" },
      { id: "offranville", name: "Offranville", postalCode: "76550" },
      { id: "rouxmesnil", name: "Rouxmesnil-Bouteilles", postalCode: "76370" },
    ],
  },
  {
    id: "zone-eure",
    name: "Zone Vallée de l’Eure",
    cities: [
      { id: "louviers", name: "Louviers", postalCode: "27400" },
      { id: "val-de-reuil", name: "Val-de-Reuil", postalCode: "27100" },
    ],
  },
];

export const initialTours: Tour[] = [
  {
    id: "tour-le-havre",
    name: "Tournée Le Havre",
    recurrence: "Toutes les semaines",
    day: "Lundi",
    dateLabel: "Lundi 31 août 2026",
    startTime: "09:00",
    endTime: "18:00",
    zoneId: "zone-le-havre",
    status: "Active",
    appointmentCount: 4,
    estimatedKm: 42,
    consultationHours: "5h",
  },
  {
    id: "tour-rouen-nord",
    name: "Tournée Rouen Nord",
    recurrence: "Toutes les semaines",
    day: "Mardi",
    dateLabel: "Mardi 1 septembre 2026",
    startTime: "09:00",
    endTime: "17:00",
    zoneId: "zone-rouen-nord",
    status: "Active",
    appointmentCount: 3,
    estimatedKm: 28,
    consultationHours: "4h",
  },
  {
    id: "tour-dieppe",
    name: "Tournée Dieppe",
    recurrence: "Une seule fois",
    day: "Vendredi",
    dateLabel: "Vendredi 4 septembre 2026",
    startTime: "10:00",
    endTime: "16:00",
    zoneId: "zone-dieppe",
    status: "Inactive",
    appointmentCount: 1,
    estimatedKm: 64,
    consultationHours: "1h30",
  },
];

export const tourAppointments: Record<string, TourAppointment[]> = {
  "tour-le-havre": [
    { id: "lh-1", time: "09:00", animalName: "Bella", service: "Ostéopathie canine", city: "Le Havre", clientName: "Émilie Morel", position: { x: 27, y: 67 } },
    { id: "lh-2", time: "11:00", animalName: "Rio", service: "Ostéopathie canine", city: "Montivilliers", clientName: "Antoine Dubois", position: { x: 55, y: 32 } },
    { id: "lh-3", time: "14:00", animalName: "Néo", service: "Massage canin", city: "Harfleur", clientName: "Camille Leroy", position: { x: 70, y: 57 } },
    { id: "lh-4", time: "16:00", animalName: "Oslo", service: "Ostéopathie canine", city: "Le Havre", clientName: "Thomas Martin", position: { x: 38, y: 76 } },
  ],
  "tour-rouen-nord": [
    { id: "rn-1", time: "09:00", animalName: "Luna", service: "Ostéopathie canine", city: "Rouen", clientName: "Marie Dupont", position: { x: 40, y: 70 } },
    { id: "rn-2", time: "12:00", animalName: "Spirit", service: "Ostéopathie équine", city: "Mont-Saint-Aignan", clientName: "Julie Robert", position: { x: 52, y: 42 } },
    { id: "rn-3", time: "15:00", animalName: "Milo", service: "Ostéopathie féline", city: "Mont-Saint-Aignan", clientName: "Julie Robert", position: { x: 70, y: 35 } },
  ],
  "tour-dieppe": [
    { id: "dp-1", time: "11:00", animalName: "Jazz", service: "Ostéopathie équine", city: "Dieppe", clientName: "Paul Laurent", position: { x: 48, y: 48 } },
  ],
};

export const mapClients: MapClient[] = [
  {
    id: "map-luna",
    clientId: "marie-dupont",
    ownerName: "Marie Dupont",
    animalName: "Luna",
    species: "Chien",
    breed: "Golden Retriever",
    city: "Rouen",
    lastConsultation: "31 août 2026",
    nextReminder: "28 février 2027",
    dueForReminder: false,
    avatar: "🐕",
    position: { x: 66, y: 66 },
  },
  {
    id: "map-oslo",
    clientId: "thomas-martin",
    ownerName: "Thomas Martin",
    animalName: "Oslo",
    species: "Chien",
    breed: "Berger blanc suisse",
    city: "Le Havre",
    lastConsultation: "18 août 2026",
    nextReminder: "18 février 2027",
    dueForReminder: true,
    avatar: "🐕‍🦺",
    position: { x: 21, y: 50 },
  },
  {
    id: "map-spirit",
    clientId: "julie-robert",
    ownerName: "Julie Robert",
    animalName: "Spirit",
    species: "Cheval",
    breed: "Selle Français",
    city: "Mont-Saint-Aignan",
    lastConsultation: "22 août 2026",
    nextReminder: "22 février 2027",
    dueForReminder: false,
    avatar: "🐎",
    position: { x: 61, y: 55 },
  },
  {
    id: "map-neo",
    clientId: "camille-leroy",
    ownerName: "Camille Leroy",
    animalName: "Néo",
    species: "Chat",
    breed: "Européen",
    city: "Harfleur",
    lastConsultation: "10 août 2026",
    nextReminder: "10 février 2027",
    dueForReminder: true,
    avatar: "🐈",
    position: { x: 29, y: 56 },
  },
  {
    id: "map-ruby",
    clientId: "camille-leroy",
    ownerName: "Camille Leroy",
    animalName: "Ruby",
    species: "Chien",
    breed: "Cocker anglais",
    city: "Harfleur",
    lastConsultation: "9 août 2026",
    nextReminder: "9 novembre 2026",
    dueForReminder: false,
    avatar: "🐶",
    position: { x: 17, y: 43 },
  },
  {
    id: "map-milo",
    clientId: "julie-robert",
    ownerName: "Julie Robert",
    animalName: "Milo",
    species: "Chat",
    breed: "Maine Coon",
    city: "Mont-Saint-Aignan",
    lastConsultation: "4 avril 2026",
    nextReminder: "4 avril 2027",
    dueForReminder: false,
    avatar: "🐈‍⬛",
    position: { x: 73, y: 58 },
  },
];
