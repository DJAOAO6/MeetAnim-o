import type { Metadata } from "next";
import { ClientsList } from "@/components/clients/clients-list";
import { getClients } from "@/lib/clients";

export const metadata: Metadata = { title: "Clients et animaux" };

type ClientsPageProps = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ClientsPage({ searchParams }: ClientsPageProps) {
  const [clients, { q }] = await Promise.all([getClients(), searchParams]);
  return <ClientsList clients={clients} initialQuery={q ?? ""} />;
}
