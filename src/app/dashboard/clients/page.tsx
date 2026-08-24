import type { Metadata } from "next";
import { ClientsList } from "@/components/clients/clients-list";
import { clients } from "@/data/clients";

export const metadata: Metadata = { title: "Clients et animaux" };

export default function ClientsPage() {
  return <ClientsList clients={clients} />;
}
