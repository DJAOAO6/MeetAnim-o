import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingFlow } from "@/components/booking/public-booking-flow";
import { bookingProfessionals } from "@/data/public-booking";

export function generateStaticParams() {
  return bookingProfessionals.map((professional) => ({ slug: professional.slug }));
}

export async function generateMetadata({ params }: PageProps<"/reserver/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const professional = bookingProfessionals.find((item) => item.slug === slug);
  return { title: professional ? `Prendre rendez-vous avec ${professional.firstName} ${professional.lastName}` : "Réservation" };
}

export default async function PublicBookingPage({ params }: PageProps<"/reserver/[slug]">) {
  const { slug } = await params;
  const professional = bookingProfessionals.find((item) => item.slug === slug);
  if (!professional) notFound();

  return <PublicBookingFlow professional={professional} />;
}
