import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingFlow } from "@/components/booking/public-booking-flow";
import { getPublishedPublicPage } from "@/lib/public-page-actions";
import { loadPublicProfessional } from "@/lib/public-professional";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps<"/reserver/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const professional = await loadPublicProfessional(slug);
  return { title: professional ? `Prendre rendez-vous avec ${professional.firstName} ${professional.lastName}` : "Réservation" };
}

export default async function PublicBookingPage({ params }: PageProps<"/reserver/[slug]">) {
  const { slug } = await params;
  const professional = await loadPublicProfessional(slug);
  if (!professional) notFound();

  // Page composée dans l'éditeur : seule la version publiée est lue ici, les
  // brouillons ne doivent jamais apparaître aux visiteurs.
  const page = await getPublishedPublicPage(slug);
  return <PublicBookingFlow professional={professional} page={page} />;
}
