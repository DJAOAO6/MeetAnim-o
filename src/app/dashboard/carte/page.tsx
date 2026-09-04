import type { Metadata } from "next";
import { ClientsMap } from "@/components/tours/clients-map";
import { PageHeader } from "@/components/layout/page-header";
import { getMapClients } from "@/lib/tours";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Carte clients" };

/**
 * Unification des tournées, phase 2 : route indépendante de la page
 * Tournées (qui affichait auparavant le même contenu sous un onglet
 * "Carte clients" — doublon de cette entrée déjà présente dans le menu
 * latéral, supprimé de ce côté-là).
 */
export default async function CartePage() {
  await requireUser();
  const [mapClients, profile] = await Promise.all([getMapClients(), getBusinessProfile()]);
  const cabinetCoordinates = profile.latitude != null && profile.longitude != null ? { lat: profile.latitude, lng: profile.longitude } : null;

  return (
    <>
      <PageHeader title="Carte clients" description="Visualisez vos clients et leurs animaux sur une carte." />
      <ClientsMap clients={mapClients} cabinetCoordinates={cabinetCoordinates} />
    </>
  );
}
