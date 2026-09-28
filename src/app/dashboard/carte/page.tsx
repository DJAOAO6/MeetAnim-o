import type { Metadata } from "next";
import { ClientsMap } from "@/components/tours/clients-map";
import { PageHeader } from "@/components/layout/page-header";
import { getMapAppointments, getMapClientSummaries } from "@/lib/map-clients";
import { parisDateId } from "@/lib/paris-time";
import { getPublicZones, getTours } from "@/lib/tours";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { requireUser } from "@/lib/auth/dal";
import { ModuleClosed } from "@/components/modules/module-closed";
import { hasModule } from "@/lib/modules";

export const metadata: Metadata = { title: "Carte clients" };

/**
 * Unification des tournées, phase 2 : route indépendante de la page
 * Tournées (qui affichait auparavant le même contenu sous un onglet
 * "Carte clients" — doublon de cette entrée déjà présente dans le menu
 * latéral, supprimé de ce côté-là).
 */
export default async function CartePage() {
  const moduleUser = await requireUser();
  if (!hasModule(moduleUser.modules, "TOURS")) return <ModuleClosed moduleKey="TOURS" />;
  const [mapClients, profile, zones, tours, appointments] = await Promise.all([getMapClientSummaries(), getBusinessProfile(), getPublicZones(), getTours(), getMapAppointments()]);
  const cabinetCoordinates = profile.latitude != null && profile.longitude != null ? { lat: profile.latitude, lng: profile.longitude } : null;

  return (
    <>
      <PageHeader title="Carte clients" description="Visualisez vos clients et leurs animaux sur une carte." />
      <ClientsMap
        clients={mapClients}
        cabinetCoordinates={cabinetCoordinates}
        practiceMode={profile.practiceMode}
        zones={zones}
        // Tournées actives qui ont encore une date à venir.
        plannedTours={tours.flatMap((tour) => (tour.status === "Active" && tour.nextOccurrenceLabel
          ? [{ id: tour.id, name: tour.name, zoneIds: tour.zoneIds.length ? tour.zoneIds : [tour.zoneId], nextOccurrenceLabel: tour.nextOccurrenceLabel, startTime: tour.startTime, endTime: tour.endTime }]
          : []))}
        appointments={appointments}
        todayId={parisDateId()}
      />
    </>
  );
}
