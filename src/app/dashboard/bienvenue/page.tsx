import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OnboardingDone, OnboardingWizard } from "@/components/onboarding/onboarding-wizard";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getAvailability, getBusinessProfile, type BusinessProfileData } from "@/lib/business-profile-actions";
import { currentOrganization } from "@/lib/organization";
import { getServices } from "@/lib/services-actions";

export const metadata: Metadata = { title: "Bienvenue" };

/**
 * Onboarding : la configuration d'un cabinet qui vient d'ouvrir, jusqu'à
 * l'ouverture de sa page de réservation. Une fois celle-ci ouverte, tout se
 * règle dans les Paramètres.
 */
export default async function WelcomePage() {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_PUBLIC_SETTINGS")) redirect("/dashboard");
  const organization = await currentOrganization();
  const [row, availability, services] = await Promise.all([getBusinessProfile(), getAvailability(), getServices()]);
  // Déjà configuré : l'écran de fin, pas un nouveau parcours. C'est aussi ce
  // que montre le rafraîchissement qui suit le dernier enregistrement.
  if (organization.onboardedAt) return <OnboardingDone slug={row.slug} />;

  // Seuls les champs du profil voyagent jusqu'au navigateur, pas la ligne
  // entière (horaires, rappels, brouillons de page publique…).
  const profile: BusinessProfileData = {
    firstName: row.firstName, lastName: row.lastName, profession: row.profession, company: row.company, phone: row.phone, email: row.email,
    address: row.address, postalCode: row.postalCode, city: row.city, location: row.location, bio: row.bio, slug: row.slug, photo: row.photo, logo: row.logo,
    publicColor: row.publicColor, tagline: row.tagline, coverPicture: row.coverPicture, website: row.website, facebook: row.facebook, instagram: row.instagram,
    registrationNumber: row.registrationNumber, acceptedPayments: row.acceptedPayments, cabinetName: row.cabinetName, cabinetInstructions: row.cabinetInstructions,
    parkingInformation: row.parkingInformation, accessibilityInformation: row.accessibilityInformation, showPhonePublicly: row.showPhonePublicly,
    showAddressPublicly: row.showAddressPublicly, showHoursPublicly: row.showHoursPublicly, showSocialsPublicly: row.showSocialsPublicly,
    showPaymentsPublicly: row.showPaymentsPublicly, practiceMode: row.practiceMode, departureLabel: row.departureLabel, departureAddress: row.departureAddress,
    cabinetAvailable: row.cabinetAvailable, homeAvailable: row.homeAvailable, latitude: row.latitude, longitude: row.longitude,
    departureLatitude: row.departureLatitude, departureLongitude: row.departureLongitude,
  };

  return <OnboardingWizard initialProfile={profile} initialAvailability={availability} initialServices={services} />;
}
