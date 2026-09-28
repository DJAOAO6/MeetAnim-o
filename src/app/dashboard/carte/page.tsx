import type { Metadata } from "next";
import { ClientsMap } from "@/components/tours/clients-map";
import { PageHeader } from "@/components/layout/page-header";
import { getMapClientSummaries } from "@/lib/map-clients";
import { getZones } from "@/lib/tours";
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
  const [mapClients, profile, zones] = await Promise.all([getMapClientSummaries(), getBusinessProfile(), getZones()]);
  const cabinetCoordinates = profile.latitude != null && profile.longitude != null ? { lat: profile.latitude, lng: profile.longitude } : null;

  return (
    <>
      <PageHeader title="Carte clients" description="Visualisez vos clients et leurs animaux sur une carte." />
      <ClientsMap
        clients={mapClients}
        cabinetCoordinates={cabinetCoordinates}
        practiceMode={profile.practiceMode}
        // Zones de tournée qui ont un secteur (lieu + rayon) : les autres,
        // décrites par une liste de communes, n'ont pas de contour à tracer.
        tourZones={zones.flatMap((zone) => (zone.sector ? [{ id: zone.id, name: zone.name, ...zone.sector }] : []))}
      />
    </>
  );
}
