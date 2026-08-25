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
