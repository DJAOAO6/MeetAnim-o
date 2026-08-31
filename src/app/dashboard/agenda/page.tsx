import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda/agenda-view";
import { getBlockedSlots } from "@/lib/blocked-slots-actions";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getClientPickerOptions } from "@/lib/clients";
import { getTours, getTourStops, getZones } from "@/lib/tours";
import type { Coordinates } from "@/data/tours";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const [clients, availability, tours, zones, tourAppointments, blockedSlots, businessProfile] = await Promise.all([
    getClientPickerOptions(),
    getAvailability(),
    getTours(),
    getZones(),
    getTourStops(),
    getBlockedSlots(),
    getBusinessProfile(),
  ]);

  const cabinetCoordinates: Coordinates | null = businessProfile.latitude != null && businessProfile.longitude != null
    ? { lat: businessProfile.latitude, lng: businessProfile.longitude }
    : null;

  return (
    <AgendaView
      clients={clients}
      availability={availability}
      tours={tours}
      zones={zones}
      tourAppointments={tourAppointments}
      initialBlockedSlots={blockedSlots}
      cabinetCoordinates={cabinetCoordinates}
    />
  );
}
