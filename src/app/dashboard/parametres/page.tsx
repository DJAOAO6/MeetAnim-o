import type { Metadata } from "next";
import { SettingsView } from "@/components/settings/settings-view";

export const metadata: Metadata = { title: "Paramètres" };

export default function ParametresPage() {
  return <SettingsView />;
}
