import type { Metadata } from "next";
import { ClientsList } from "@/components/clients/clients-list";
import { getClients } from "@/lib/clients";

export const metadata: Metadata = { title: "Clients et animaux" };

export default async function ClientsPage() {
  const clients = await getClients();
  return <ClientsList clients={clients} />;
}
