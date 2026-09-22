import type { Metadata } from "next";
import { ServicesView } from "@/components/settings/services-view";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getServices } from "@/lib/services-actions";
import { getZones } from "@/lib/tours";

export const metadata: Metadata = { title: "Prestations" };

export default async function PrestationsPage() {
  const [services, zones, availability, profile] = await Promise.all([getServices(), getZones(), getAvailability(), getBusinessProfile()]);
  return <ServicesView initialServices={services} zoneNames={zones.map((zone) => zone.name)} defaultDuration={availability.defaultAppointmentDuration} practiceMode={profile.practiceMode} />;
}
