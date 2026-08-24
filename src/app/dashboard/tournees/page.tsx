import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { initialTours, initialZones, mapClients, tourAppointments } from "@/data/tours";

export const metadata: Metadata = { title: "Tournées" };

export default function TourneesPage() {
  return <ToursView initialTab="tours" initialTours={initialTours} initialZones={initialZones} appointments={tourAppointments} mapClients={mapClients} />;
}
