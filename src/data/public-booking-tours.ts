import type { MapClient, Tour, TourAppointment } from "@/data/tours";

// Données figées utilisées uniquement pour suggérer des créneaux de tournée
// dans le tunnel de réservation publique. Volontairement indépendantes des
// tournées réelles (gérées en base) : la réservation publique s’appuie sur
// des identifiants de zone stables ("zone-rouen-nord", etc.) définis dans
// public-booking.ts, distincts des identifiants générés en base.

export const publicBookingTours: Tour[] = [
  { id: "tour-le-havre", name: "Tournée Le Havre", recurrence: "Toutes les semaines", day: "Lundi", dateLabel: "Chaque lundi", startTime: "09:00", endTime: "18:00", zoneId: "zone-le-havre", status: "Active", appointmentCount: 4, estimatedKm: 42, consultationHours: "5h" },
  { id: "tour-rouen-nord", name: "Tournée Rouen Nord", recurrence: "Toutes les semaines", day: "Mardi", dateLabel: "Chaque mardi", startTime: "09:00", endTime: "17:00", zoneId: "zone-rouen-nord", status: "Active", appointmentCount: 3, estimatedKm: 28, consultationHours: "4h" },
  { id: "tour-dieppe", name: "Tournée Dieppe", recurrence: "Toutes les semaines", day: "Vendredi", dateLabel: "Chaque vendredi", startTime: "10:00", endTime: "16:00", zoneId: "zone-dieppe", status: "Active", appointmentCount: 1, estimatedKm: 64, consultationHours: "1h30" },
];

export const publicBookingTourAppointments: Record<string, TourAppointment[]> = {
  "tour-le-havre": [
    { id: "lh-1", time: "09:00", animalName: "Bella", service: "Ostéopathie canine", city: "Le Havre", clientName: "Émilie Morel", position: { x: 27, y: 67 }, coordinates: { lat: 49.4938, lng: 0.1077 } },
    { id: "lh-2", time: "11:00", animalName: "Rio", service: "Ostéopathie canine", city: "Montivilliers", clientName: "Antoine Dubois", position: { x: 55, y: 32 }, coordinates: { lat: 49.5459, lng: 0.1875 } },
    { id: "lh-3", time: "14:00", animalName: "Néo", service: "Massage canin", city: "Harfleur", clientName: "Camille Leroy", position: { x: 70, y: 57 }, coordinates: { lat: 49.5, lng: 0.2 } },
    { id: "lh-4", time: "16:00", animalName: "Oslo", service: "Ostéopathie canine", city: "Le Havre", clientName: "Thomas Martin", position: { x: 38, y: 76 }, coordinates: { lat: 49.4874, lng: 0.1234 } },
  ],
  "tour-rouen-nord": [
    { id: "rn-1", time: "09:00", animalName: "Luna", service: "Ostéopathie canine", city: "Rouen", clientName: "Marie Dupont", position: { x: 40, y: 70 }, coordinates: { lat: 49.4432, lng: 1.0999 } },
    { id: "rn-2", time: "12:00", animalName: "Spirit", service: "Ostéopathie équine", city: "Mont-Saint-Aignan", clientName: "Julie Robert", position: { x: 52, y: 42 }, coordinates: { lat: 49.4644, lng: 1.0772 } },
    { id: "rn-3", time: "15:00", animalName: "Milo", service: "Ostéopathie féline", city: "Mont-Saint-Aignan", clientName: "Julie Robert", position: { x: 70, y: 35 }, coordinates: { lat: 49.4661, lng: 1.0813 } },
  ],
  "tour-dieppe": [
    { id: "dp-1", time: "11:00", animalName: "Jazz", service: "Ostéopathie équine", city: "Dieppe", clientName: "Paul Laurent", position: { x: 48, y: 48 }, coordinates: { lat: 49.9219, lng: 1.0771 } },
  ],
};

export const publicBookingMapClients: MapClient[] = [
  { id: "map-luna", clientId: "marie-dupont", ownerName: "Marie Dupont", animalName: "Luna", species: "Chien", breed: "Golden Retriever", city: "Rouen", lastConsultation: "31 août 2026", nextReminder: "28 février 2027", dueForReminder: false, avatar: "🐕", position: { x: 66, y: 66 }, coordinates: { lat: 49.4432, lng: 1.0999 } },
  { id: "map-oslo", clientId: "thomas-martin", ownerName: "Thomas Martin", animalName: "Oslo", species: "Chien", breed: "Berger blanc suisse", city: "Le Havre", lastConsultation: "18 août 2026", nextReminder: "18 février 2027", dueForReminder: true, avatar: "🐕‍🦺", position: { x: 21, y: 50 }, coordinates: { lat: 49.4938, lng: 0.1077 } },
  { id: "map-spirit", clientId: "julie-robert", ownerName: "Julie Robert", animalName: "Spirit", species: "Cheval", breed: "Selle Français", city: "Mont-Saint-Aignan", lastConsultation: "22 août 2026", nextReminder: "22 février 2027", dueForReminder: false, avatar: "🐎", position: { x: 61, y: 55 }, coordinates: { lat: 49.4644, lng: 1.0772 } },
  { id: "map-neo", clientId: "camille-leroy", ownerName: "Camille Leroy", animalName: "Néo", species: "Chat", breed: "Européen", city: "Harfleur", lastConsultation: "10 août 2026", nextReminder: "10 février 2027", dueForReminder: true, avatar: "🐈", position: { x: 29, y: 56 }, coordinates: { lat: 49.5, lng: 0.2 } },
  { id: "map-ruby", clientId: "camille-leroy", ownerName: "Camille Leroy", animalName: "Ruby", species: "Chien", breed: "Cocker anglais", city: "Harfleur", lastConsultation: "9 août 2026", nextReminder: "9 novembre 2026", dueForReminder: false, avatar: "🐶", position: { x: 17, y: 43 }, coordinates: { lat: 49.5023, lng: 0.2045 } },
  { id: "map-milo", clientId: "julie-robert", ownerName: "Julie Robert", animalName: "Milo", species: "Chat", breed: "Maine Coon", city: "Mont-Saint-Aignan", lastConsultation: "4 avril 2026", nextReminder: "4 avril 2027", dueForReminder: false, avatar: "🐈‍⬛", position: { x: 73, y: 58 }, coordinates: { lat: 49.4661, lng: 1.0813 } },
];
