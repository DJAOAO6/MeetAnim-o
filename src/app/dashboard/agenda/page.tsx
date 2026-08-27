import type { Metadata } from "next";
import { AgendaView } from "@/components/agenda/agenda-view";
import { getBlockedSlots } from "@/lib/blocked-slots-actions";
import { getAvailability } from "@/lib/business-profile-actions";
import { getClientPickerOptions } from "@/lib/clients";
import { getTourAppointments, getTours, getZones } from "@/lib/tours";

export const metadata: Metadata = { title: "Agenda" };

export default async function AgendaPage() {
  const [clients, availability, tours, zones, tourAppointments, blockedSlots] = await Promise.all([
    getClientPickerOptions(),
    getAvailability(),
    getTours(),
    getZones(),
    getTourAppointments(),
    getBlockedSlots(),
  ]);

  return (
    <AgendaView
      clients={clients}
      availability={availability}
      tours={tours}
      zones={zones}
      tourAppointments={tourAppointments}
      initialBlockedSlots={blockedSlots}
    />
  );
}
