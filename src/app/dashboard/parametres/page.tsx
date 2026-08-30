import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getTours, getZones } from "@/lib/tours";
import { getAvailability, getBusinessProfile, getReminderSettings } from "@/lib/business-profile-actions";
import { getServices } from "@/lib/services-actions";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const [tours, zones, businessProfile, availability, reminders, services] = await Promise.all([getTours(), getZones(), getBusinessProfile(), getAvailability(), getReminderSettings(), getServices()]);
  return <SettingsView tours={tours} zones={zones} businessProfile={businessProfile} availability={availability} reminders={reminders} services={services} />;
}
