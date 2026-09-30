import type { Metadata } from "next";
import { ClientsList } from "@/components/clients/clients-list";
import { getClients } from "@/lib/clients";

export const metadata: Metadata = { title: "Clients et animaux" };

type ClientsPageProps = {
  searchParams: Promise<{ q?: string; nouveau?: string }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [clients, { q, nouveau }] = await Promise.all([getClients(), searchParams]);
  // ?nouveau=1 : arrivée depuis « Ajouter un client » (carte vide).
  return <ClientsList clients={clients} initialQuery={q ?? ""} initialCreating={nouveau === "1"} />;
}
