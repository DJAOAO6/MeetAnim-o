import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientProfile } from "@/components/clients/client-profile";
import { getClientById } from "@/lib/clients";

type ClientPageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ animal?: string }>;
};

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = await getClientById(id);

  return {
    title: client ? `${client.firstName} ${client.lastName}` : "Client introuvable",
  };
}

export default async function ClientPage({ params, searchParams }: ClientPageProps) {
  const { id } = await params;
  const { animal } = await searchParams;
  const client = await getClientById(id);

  if (!client) {
    notFound();
  }

  return <ClientProfile client={client} initialAnimalId={animal} />;
}
