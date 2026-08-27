import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingFlow } from "@/components/booking/public-booking-flow";
import { bookingProfessionals, type PublicProfessional } from "@/data/public-booking";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { getPublicServices } from "@/lib/services-actions";

export const dynamic = "force-dynamic";

async function loadProfessional(slug: string): Promise<PublicProfessional | null> {
  const profile = await getBusinessProfile();
  if (profile.slug !== slug) return null;

  const base = bookingProfessionals[0];
  const services = await getPublicServices();
  return {
    ...base,
    slug: profile.slug,
    firstName: profile.firstName,
    lastName: profile.lastName,
    profession: profile.profession,
    company: profile.company,
    bio: profile.bio,
    location: profile.location,
    cabinetAddress: profile.address,
    cabinetPostalCode: profile.postalCode,
    cabinetCity: profile.city,
    color: profile.publicColor,
    logo: profile.logo,
    photo: profile.photo,
    cabinetAvailable: profile.cabinetAvailable,
    homeAvailable: profile.homeAvailable,
    services,
  };
}

export async function generateMetadata({ params }: PageProps<"/reserver/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const professional = await loadProfessional(slug);
  return { title: professional ? `Prendre rendez-vous avec ${professional.firstName} ${professional.lastName}` : "Réservation" };
}

export default async function PublicBookingPage({ params }: PageProps<"/reserver/[slug]">) {
  const { slug } = await params;
  const professional = await loadProfessional(slug);
  if (!professional) notFound();

  return <PublicBookingFlow professional={professional} />;
}
