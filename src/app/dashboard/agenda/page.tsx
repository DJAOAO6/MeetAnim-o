import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda/agenda-view";
import { getBlockedSlots } from "@/lib/blocked-slots-actions";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getClientPickerOptions } from "@/lib/clients";
import { getTours, getTourStops } from "@/lib/tours";
import { getAgendaDisplay } from "@/lib/agenda-preferences-actions";

export const metadata: Metadata = { title: "Agenda" };

// ?date=AAAA-MM-JJ : l'agenda s'ouvre sur la semaine (ou le jour, sur
// téléphone) qui contient cette date — par exemple depuis « Voir dans
// l'agenda » après la création d'un rendez-vous. Une date invalide est ignorée.
export default async function AgendaPage() {
  const [clients, availability, tours, tourAppointments, blockedSlots, profile, display] = await Promise.all([
    getClientPickerOptions(),
    getAvailability(),
    getTours(),
    getTourStops(),
    getBlockedSlots(),
    getBusinessProfile(),
    getAgendaDisplay(),
  ]);

  return (
    <AgendaView
      clients={clients}
      availability={availability}
      tours={tours}
      tourAppointments={tourAppointments}
      initialBlockedSlots={blockedSlots}
      practiceMode={profile.practiceMode}
      initialDisplay={display}
    />
  );
}
