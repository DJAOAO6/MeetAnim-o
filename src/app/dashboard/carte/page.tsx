import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getToursPageData } from "@/lib/tours";
import { getTourRunEditorData, todayDateId } from "@/lib/tour-runs";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Carte clients" };

export default async function CartePage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const dateId = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDateId();

  const user = await requireUser();
  const [{ zones, tours, appointments, mapClients, cabinetCoordinates, cabinetAddress }, editorData] = await Promise.all([
    getToursPageData(),
    getTourRunEditorData(user.id, dateId),
  ]);

  return (
    <ToursView
      initialTab="map"
      initialTours={tours}
      initialZones={zones}
      appointments={appointments}
      mapClients={mapClients}
      cabinetCoordinates={cabinetCoordinates}
      cabinetAddress={cabinetAddress}
      editorDateId={dateId}
      editorData={editorData}
      explicitDate={Boolean(date)}
    />
  );
}
