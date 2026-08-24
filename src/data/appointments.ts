export type AppointmentMode = "cabinet" | "home";
export type AppointmentStatus = "pending" | "confirmed" | "completed" | "cancelled";

export type Appointment = {
  id: string;
  date: string;
  start: string;
  duration: number;
  clientName: string;
  animalName: string;
  serviceName: string;
  mode: AppointmentMode;
  location: string;
  price: number;
  status: AppointmentStatus;
  notes: string;
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  pending: "En attente",
  confirmed: "Confirmé",
  completed: "Terminé",
  cancelled: "Annulé",
};

export const initialAppointments: Appointment[] = [
  { id: "rdv-luna-2408", date: "2026-08-24", start: "09:00", duration: 60, clientName: "Marie Dupont", animalName: "Luna", serviceName: "Ostéopathie canine", mode: "cabinet", location: "Cabinet", price: 60, status: "confirmed", notes: "Bilan de mobilité." },
  { id: "rdv-spirit-2408", date: "2026-08-24", start: "11:00", duration: 90, clientName: "Julie Robert", animalName: "Spirit", serviceName: "Ostéopathie équine", mode: "home", location: "Mont-Saint-Aignan", price: 90, status: "confirmed", notes: "Consultation à l’écurie." },
  { id: "rdv-oslo-2408", date: "2026-08-24", start: "14:30", duration: 60, clientName: "Thomas Martin", animalName: "Oslo", serviceName: "Ostéopathie canine", mode: "home", location: "Le Havre", price: 70, status: "confirmed", notes: "Première consultation." },
  { id: "rdv-oscar-2408", date: "2026-08-24", start: "17:00", duration: 60, clientName: "Marie Dupont", animalName: "Oscar", serviceName: "Ostéopathie féline", mode: "cabinet", location: "Cabinet", price: 55, status: "confirmed", notes: "Suivi annuel." },
  { id: "rdv-nala-2508", date: "2026-08-25", start: "08:00", duration: 120, clientName: "Julie Robert", animalName: "Nala", serviceName: "Ostéopathie féline", mode: "home", location: "Mont-Saint-Aignan", price: 65, status: "pending", notes: "Demande reçue depuis la page publique." },
  { id: "rdv-milo-2608", date: "2026-08-26", start: "10:00", duration: 90, clientName: "Julie Robert", animalName: "Milo", serviceName: "Ostéopathie féline", mode: "home", location: "Mont-Saint-Aignan", price: 65, status: "confirmed", notes: "Contrôle de mobilité." },
  { id: "rdv-ruby-2708", date: "2026-08-27", start: "09:30", duration: 60, clientName: "Camille Leroy", animalName: "Ruby", serviceName: "Ostéopathie canine", mode: "cabinet", location: "Cabinet", price: 60, status: "confirmed", notes: "Suivi après effort." },
  { id: "rdv-simba-2708", date: "2026-08-27", start: "12:00", duration: 90, clientName: "Thomas Roy", animalName: "Simba", serviceName: "Ostéopathie canine", mode: "home", location: "Isneauville", price: 70, status: "confirmed", notes: "Consultation à domicile." },
  { id: "rdv-tao-2708", date: "2026-08-27", start: "16:00", duration: 60, clientName: "Julie Masson", animalName: "Tao", serviceName: "Massage canin", mode: "cabinet", location: "Cabinet", price: 50, status: "confirmed", notes: "Récupération musculaire." },
  { id: "rdv-oslo-2708", date: "2026-08-27", start: "18:00", duration: 60, clientName: "Thomas Martin", animalName: "Oslo", serviceName: "Ostéopathie canine", mode: "home", location: "Le Havre", price: 70, status: "pending", notes: "Demande à confirmer." },
  { id: "rdv-jasper-2808", date: "2026-08-28", start: "13:30", duration: 60, clientName: "Anne Lefèvre", animalName: "Jasper", serviceName: "Ostéopathie canine", mode: "cabinet", location: "Cabinet", price: 60, status: "confirmed", notes: "Bilan complet." },
  { id: "rdv-nova-2908", date: "2026-08-29", start: "10:00", duration: 60, clientName: "Luc Bernard", animalName: "Nova", serviceName: "Ostéopathie canine", mode: "home", location: "Sotteville-lès-Rouen", price: 70, status: "confirmed", notes: "Consultation de suivi." },
];
