import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getToursPageData } from "@/lib/tours";
import { getTourRunEditorData, todayDateId } from "@/lib/tour-runs";
import { generateUpcomingTourRuns } from "@/lib/tour-run-generation";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Tournées" };

export default async function TourneesPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date } = await searchParams;
  const dateId = date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : todayDateId();

  const user = await requireUser();
  // Filet en attendant que le cron quotidien tourne réellement en production
  // (Vercel crons) — idempotent par construction (index unique
  // templateId+date+userId), donc sans risque à rejouer à chaque lecture de
  // la page. Avant les lectures ci-dessous : une occurrence tout juste
  // générée pour `dateId` doit apparaître dans ce même rendu.
  await generateUpcomingTourRuns();

  const [{ zones, tours, appointments, mapClients, cabinetCoordinates, cabinetAddress }, editorData] = await Promise.all([
    getToursPageData(),
    getTourRunEditorData(user.id, dateId),
  ]);

  return (
    <ToursView
      initialTab="tours"
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
