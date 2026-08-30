import type { Metadata } from "next";
import { ServicesView } from "@/components/settings/services-view";
import { getServices } from "@/lib/services-actions";
import { getZones } from "@/lib/tours";

export const metadata: Metadata = { title: "Prestations" };

export default async function PrestationsPage() {
  const [services, zones] = await Promise.all([getServices(), getZones()]);
  return <ServicesView initialServices={services} zoneNames={zones.map((zone) => zone.name)} />;
}
