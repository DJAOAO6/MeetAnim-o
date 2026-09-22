import "server-only";

import type { PublicProfessional } from "@/data/public-booking";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getPublicServices } from "@/lib/services-actions";
import { getPublicZones } from "@/lib/tours";
import { formatPublicOpeningHours } from "@/lib/public-hours";
import { dbForSlug } from "@/lib/organization";

/**
 * Données publiques du professionnel, partagées par la page de réservation et
 * par l'aperçu de l'éditeur : l'aperçu doit montrer exactement ce que verront
 * les clients, ce qui n'est vrai que si les deux lisent la même source.
 *
 * `slug` absent = on ne vérifie pas la correspondance (cas de l'éditeur, qui
 * travaille sur son propre profil).
 */
export async function loadPublicProfessional(slug?: string): Promise<PublicProfessional | null> {
  // Avec un lien, c'est lui qui désigne le cabinet — un lien inconnu ne mène
  // à rien. Sans lien (aperçu de l'éditeur), c'est celui du compte connecté.
  const db = slug === undefined ? undefined : await dbForSlug(slug) ?? null;
  if (db === null) return null;

  const profile = await getBusinessProfile(db);
  if (slug !== undefined && profile.slug !== slug) return null;

  const [services, zones, availability] = await Promise.all([getPublicServices(db), getPublicZones(db), getAvailability(db)]);
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
    practiceMode: profile.practiceMode,
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
    availabilityMessage: availability.publicMessage?.trim() || undefined,
  };
}

