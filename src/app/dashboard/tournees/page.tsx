import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getToursPageData } from "@/lib/tours";

export const metadata: Metadata = { title: "Tournées" };

export default async function TourneesPage() {
  const { zones, tours, appointments, mapClients, weeklyHomeAppointments, cabinetCoordinates, fillOpportunities } = await getToursPageData();
  return (
    <ToursView
      initialTab="tours"
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
