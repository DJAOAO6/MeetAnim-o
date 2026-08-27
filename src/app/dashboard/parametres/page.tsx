import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getTours, getZones } from "@/lib/tours";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const [tours, zones, businessProfile, availability] = await Promise.all([getTours(), getZones(), getBusinessProfile(), getAvailability()]);
  return <SettingsView tours={tours} zones={zones} businessProfile={businessProfile} availability={availability} />;
}
