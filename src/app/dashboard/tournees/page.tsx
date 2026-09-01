import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getMapClients } from "@/lib/tours";
import { getTourRunEditorData, getTourRunsListData, todayDateId } from "@/lib/tour-runs";
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

  const [editorData, listData, mapClients] = await Promise.all([
    getTourRunEditorData(user.id, dateId),
    getTourRunsListData(user.id, todayDateId()),
    getMapClients(),
  ]);

  const cabinetCoordinates =
    editorData.cabinet.latitude != null && editorData.cabinet.longitude != null
      ? { lat: editorData.cabinet.latitude, lng: editorData.cabinet.longitude }
      : null;

  return (
    <ToursView
      listData={listData}
      editorDateId={dateId}
      editorData={editorData}
      cabinetCoordinates={cabinetCoordinates}
      mapClients={mapClients}
      explicitDate={Boolean(date)}
    />
  );
}
