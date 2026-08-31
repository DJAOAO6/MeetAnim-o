import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getToursPageData } from "@/lib/tours";

export const metadata: Metadata = { title: "Carte clients" };

export default async function CartePage() {
  const { zones, tours, appointments, mapClients, weeklyHomeAppointments, cabinetCoordinates, fillOpportunities } = await getToursPageData();
  return (
    <ToursView
      initialTab="map"
      initialTours={tours}
      initialZones={zones}
      appointments={appointments}
      mapClients={mapClients}
      weeklyHomeAppointments={weeklyHomeAppointments}
      cabinetCoordinates={cabinetCoordinates}
      fillOpportunities={fillOpportunities}
    />
  );
}
