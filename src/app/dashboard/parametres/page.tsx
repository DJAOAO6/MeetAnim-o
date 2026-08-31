import type { Metadata } from "next";
import { Suspense } from "react";
import { SettingsView } from "@/components/settings/settings-view";
import { getTours, getZones } from "@/lib/tours";
import { getAvailability, getBusinessProfile, getReminderSettings } from "@/lib/business-profile-actions";
import { getServices } from "@/lib/services-actions";
import { getGoogleIntegrationState, getIcsFeedState } from "@/lib/calendar";

export const metadata: Metadata = { title: "Paramètres" };

export default async function ParametresPage() {
  const [tours, zones, businessProfile, availability, reminders, services, google, icsFeed] = await Promise.all([
    getTours(),
    getZones(),
    getBusinessProfile(),
    getAvailability(),
    getReminderSettings(),
    getServices(),
    getGoogleIntegrationState(),
    getIcsFeedState(),
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
      />
    </Suspense>
  );
}
