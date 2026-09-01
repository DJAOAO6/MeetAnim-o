import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicBookingFlow } from "@/components/booking/public-booking-flow";
import type { PublicProfessional } from "@/data/public-booking";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getPublicServices } from "@/lib/services-actions";
import { getPublicZones } from "@/lib/tours";
import { formatPublicOpeningHours } from "@/lib/public-hours";

export const dynamic = "force-dynamic";

async function loadProfessional(slug: string): Promise<PublicProfessional | null> {
  const profile = await getBusinessProfile();
  if (profile.slug !== slug) return null;

  const [services, zones, availability] = await Promise.all([getPublicServices(), getPublicZones(), getAvailability()]);
  return {
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
    cabinetLatitude: profile.latitude,
    cabinetLongitude: profile.longitude,
    color: profile.publicColor,
    logo: profile.logo,
    photo: profile.photo,
    phone: profile.phone,
    cabinetAvailable: profile.cabinetAvailable,
    homeAvailable: profile.homeAvailable,
    services,
    zones,
    tagline: profile.tagline,
    coverPicture: profile.coverPicture,
    website: profile.website,
    facebook: profile.facebook,
    instagram: profile.instagram,
    registrationNumber: profile.registrationNumber,
    acceptedPayments: profile.acceptedPayments,
    cabinetName: profile.cabinetName,
    cabinetInstructions: profile.cabinetInstructions,
    parkingInformation: profile.parkingInformation,
    accessibilityInformation: profile.accessibilityInformation,
    showPhonePublicly: profile.showPhonePublicly,
    showAddressPublicly: profile.showAddressPublicly,
    showHoursPublicly: profile.showHoursPublicly,
    showSocialsPublicly: profile.showSocialsPublicly,
    showPaymentsPublicly: profile.showPaymentsPublicly,
    openingHours: formatPublicOpeningHours(availability),
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
