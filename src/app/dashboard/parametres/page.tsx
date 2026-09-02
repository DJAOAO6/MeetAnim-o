import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";
import { getTours, getZones } from "@/lib/tours";
import { getAvailability, getBusinessProfile, getReminderSettings } from "@/lib/business-profile-actions";
import { getServices } from "@/lib/services-actions";
import { getGoogleIntegrationState, getIcsFeedState } from "@/lib/calendar";
import { getOrCreateTourPreferences, getUpcomingGeneratedCounts, listSavedPlaces, toSavedPlaceView } from "@/lib/tour-runs";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const user = await requireUser();
  const [tours, zones, businessProfile, availability, reminders, services, google, icsFeed, savedPlaceRows, preferences, upcomingGeneratedCounts] = await Promise.all([
    getTours(),
    getZones(),
    getBusinessProfile(),
    getAvailability(),
    getReminderSettings(),
    getServices(),
    getGoogleIntegrationState(),
    getIcsFeedState(),
    listSavedPlaces(user.id),
    getOrCreateTourPreferences(user.id),
    getUpcomingGeneratedCounts(user.id),
  ]);
  return (
    // Suspense requis par useSearchParams (retour du callback OAuth Google —
    // voir settings-view.tsx) : toutes les données sont déjà résolues
    // ci-dessus, rien ne suspend réellement ici en pratique.
    <Suspense fallback={null}>
      <SettingsView
        tours={tours}
        zones={zones}
        businessProfile={businessProfile}
        availability={availability}
        reminders={reminders}
        services={services}
        google={google}
        icsFeed={icsFeed}
        savedPlaces={savedPlaceRows.map(toSavedPlaceView)}
        tourPreferences={preferences}
        upcomingGeneratedCounts={upcomingGeneratedCounts}
      />
    </Suspense>
  );
}
