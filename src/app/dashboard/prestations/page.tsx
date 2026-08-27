import type { Metadata } from "next";
import { ServicesView } from "@/components/settings/services-view";
import { getServices } from "@/lib/services-actions";

export const metadata: Metadata = { title: "Prestations" };

export default async function PrestationsPage() {
  const services = await getServices();
  return <ServicesView initialServices={services} />;
}
