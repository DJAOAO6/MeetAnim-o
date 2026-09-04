import type { Metadata } from "next";
import { ToursView } from "@/components/tours/tours-view";
import { getMapClients } from "@/lib/tours";
import { getTourRunEditorData, getTourRunsListData, todayDateId } from "@/lib/tour-runs";
import { generateUpcomingTourRuns } from "@/lib/tour-run-generation";
import { getServices } from "@/lib/services-actions";
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

  const [editorData, listData, services] = await Promise.all([
    getTourRunEditorData(user.id, dateId),
    getTourRunsListData(user.id, todayDateId()),
    getServices(),
  ]);
  // Phase 3 bis (suite) : "ajouter à cette journée" depuis un client de la
  // carte crée un vrai rendez-vous à domicile — seules les prestations
  // actives et proposées à domicile ont un sens dans ce formulaire.
  const homeServices = services.filter((service) => service.active && service.homeEnabled);

  const cabinetCoordinates =
    editorData.cabinet.latitude != null && editorData.cabinet.longitude != null
      ? { lat: editorData.cabinet.latitude, lng: editorData.cabinet.longitude }
      : null;

  // Phase 3 bis, correctif : ne charge que les clients potentiellement
  // pertinents pour une tournée (large rectangle autour du cabinet, 100 km —
  // au-delà du plus grand rayon réglable côté écran) plutôt que la base
  // entière à chaque chargement — /dashboard/carte, elle, veut vraiment
  // tout le monde et n'est pas concernée par ce filtre.
  const mapClients = await getMapClients(cabinetCoordinates ? { ...cabinetCoordinates, radiusKm: 100 } : undefined);

  return (
    <ToursView
      listData={listData}
      editorDateId={dateId}
      editorData={editorData}
      cabinetCoordinates={cabinetCoordinates}
      mapClients={mapClients}
      homeServices={homeServices}
      explicitDate={Boolean(date)}
    />
  );
}
