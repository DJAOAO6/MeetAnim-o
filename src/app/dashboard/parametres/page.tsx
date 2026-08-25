import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";
import { getTours, getZones } from "@/lib/tours";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const [tours, zones] = await Promise.all([getTours(), getZones()]);
  return <SettingsView tours={tours} zones={zones} />;
}
