export type ReminderStatus = "À relancer" | "Rappel envoyé" | "RDV repris" | "Ignoré" | "À venir";

export type Reminder = {
  id: string;
  clientId: string;
  clientName: string;
  clientFirstName: string;
  animalId: string;
  animalName: string;
  animalSpecies: string;
  lastConsultation: string;
  delay: "3 mois" | "6 mois" | "12 mois" | "Date personnalisée";
  dueDate: string;
  status: ReminderStatus;
  note?: string;
};

export type ReminderClientOption = {
  id: string;
  name: string;
  animals: Array<{ id: string; name: string; species: string }>;
};

export const initialReminderStats = {
  due: 8,
  sent: 12,
  booked: 5,
  upcoming: 16,
};

export const initialReminders: Reminder[] = [
  {
    id: "rappel-luna-aout",
    clientId: "marie-dupont",
    clientName: "Marie Dupont",
    clientFirstName: "Marie",
    animalId: "luna",
    animalName: "Luna",
    animalSpecies: "Chien",
    lastConsultation: "12 février 2026",
    delay: "6 mois",
    dueDate: "2026-08-12",
    status: "À relancer",
  },
  {
    id: "rappel-oslo-aout",
    clientId: "thomas-martin",
    clientName: "Thomas Martin",
    clientFirstName: "Thomas",
    animalId: "oslo",
    animalName: "Oslo",
    animalSpecies: "Chien",
    lastConsultation: "18 février 2026",
    delay: "6 mois",
    dueDate: "2026-08-18",
    status: "À relancer",
  },
  {
    id: "rappel-spirit-aout",
    clientId: "julie-robert",
    clientName: "Julie Robert",
    clientFirstName: "Julie",
    animalId: "spirit",
    animalName: "Spirit",
    animalSpecies: "Cheval",
    lastConsultation: "22 février 2026",
    delay: "6 mois",
    dueDate: "2026-08-22",
    status: "Rappel envoyé",
  },
  {
    id: "rappel-neo-aout",
    clientId: "camille-leroy",
    clientName: "Camille Leroy",
    clientFirstName: "Camille",
    animalId: "neo",
    animalName: "Néo",
    animalSpecies: "Chat",
    lastConsultation: "10 février 2026",
    delay: "6 mois",
    dueDate: "2026-08-10",
    status: "RDV repris",
  },
  {
    id: "rappel-ruby-aout",
    clientId: "sophie-bernard",
    clientName: "Sophie Bernard",
    clientFirstName: "Sophie",
    animalId: "ruby",
    animalName: "Ruby",
    animalSpecies: "Chien",
    lastConsultation: "29 mai 2026",
    delay: "3 mois",
    dueDate: "2026-08-29",
    status: "À venir",
  },
  {
    id: "rappel-milo-aout",
    clientId: "claire-petit",
    clientName: "Claire Petit",
    clientFirstName: "Claire",
    animalId: "milo",
    animalName: "Milo",
    animalSpecies: "Chat",
    lastConsultation: "5 février 2026",
    delay: "6 mois",
    dueDate: "2026-08-05",
    status: "Ignoré",
  },
  {
    id: "rappel-oscar-septembre",
    clientId: "marie-dupont",
    clientName: "Marie Dupont",
    clientFirstName: "Marie",
    animalId: "oscar",
    animalName: "Oscar",
    animalSpecies: "Chat",
    lastConsultation: "15 juin 2026",
    delay: "3 mois",
    dueDate: "2026-09-15",
    status: "À venir",
  },
  {
    id: "rappel-jazz-septembre",
    clientId: "paul-laurent",
    clientName: "Paul Laurent",
    clientFirstName: "Paul",
    animalId: "jazz",
    animalName: "Jazz",
    animalSpecies: "Cheval",
    lastConsultation: "18 mars 2026",
    delay: "6 mois",
    dueDate: "2026-09-18",
    status: "À venir",
  },
];

export const reminderClientOptions: ReminderClientOption[] = [
  {
    id: "marie-dupont",
    name: "Marie Dupont",
    animals: [
      { id: "luna", name: "Luna", species: "Chien" },
      { id: "oscar", name: "Oscar", species: "Chat" },
    ],
  },
  {
    id: "thomas-martin",
    name: "Thomas Martin",
    animals: [{ id: "oslo", name: "Oslo", species: "Chien" }],
  },
  {
    id: "julie-robert",
    name: "Julie Robert",
    animals: [{ id: "spirit", name: "Spirit", species: "Cheval" }],
  },
  {
    id: "camille-leroy",
    name: "Camille Leroy",
    animals: [{ id: "neo", name: "Néo", species: "Chat" }],
  },
  {
    id: "sophie-bernard",
    name: "Sophie Bernard",
    animals: [{ id: "ruby", name: "Ruby", species: "Chien" }],
  },
];
