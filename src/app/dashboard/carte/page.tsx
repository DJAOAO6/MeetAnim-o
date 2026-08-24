import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { initialTours, initialZones, mapClients, tourAppointments } from "@/data/tours";

export const metadata: Metadata = { title: "Carte clients" };

export default function CartePage() {
  return <ToursView initialTab="map" initialTours={initialTours} initialZones={initialZones} appointments={tourAppointments} mapClients={mapClients} />;
}
