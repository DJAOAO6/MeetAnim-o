import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ClientProfile } from "@/components/clients/client-profile";
import { clients, getClientById } from "@/data/clients";

type ClientPageProps = {
  params: Promise<{ id: string }>;
};

export function generateStaticParams() {
  return clients.map((client) => ({ id: client.id }));
}

export async function generateMetadata({ params }: ClientPageProps): Promise<Metadata> {
  const { id } = await params;
  const client = getClientById(id);

  return {
    title: client ? `${client.firstName} ${client.lastName}` : "Client introuvable",
  };
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { id } = await params;
  const client = getClientById(id);

  if (!client) {
    notFound();
  }

  return <ClientProfile client={client} />;
}
