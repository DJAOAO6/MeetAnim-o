import type { Metadata } from "next";
import { ServicesView } from "@/components/settings/services-view";

export const metadata: Metadata = { title: "Prestations" };

export default function PrestationsPage() {
  return <ServicesView />;
}
