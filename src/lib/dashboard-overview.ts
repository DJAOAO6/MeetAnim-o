import "server-only";
import { getAvailability, getBusinessProfile } from "@/lib/business-profile-actions";
import { getClients } from "@/lib/clients";
import { getReminders } from "@/lib/reminders";
import { getTours, getTourStops, getZones } from "@/lib/tours";
import type { Client } from "@/data/clients";
import type { Reminder } from "@/data/reminders";
import type { Tour, TourAppointment, Zone } from "@/data/tours";
import type { AvailabilitySettings } from "@/data/settings";

export type DashboardOverviewData = {
  clients: Client[];
  tours: Tour[];
  zones: Zone[];
  tourAppointments: Record<string, TourAppointment[]>;
  reminders: Reminder[];
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  // Horaires, fermetures programmées et message client : le badge du tableau
  // de bord annonce « fermé du 25 au 2 », pas seulement « ouvert ».
  availability: AvailabilitySettings;
};

export async function getDashboardOverviewData(): Promise<DashboardOverviewData> {
  const [clients, tours, zones, tourAppointments, reminders, businessProfile, availability] = await Promise.all([
    getClients(),
    getTours(),
    getZones(),
    getTourStops(),
    getReminders(),
    getBusinessProfile(),
    getAvailability(),
  ]);

  return { clients, tours, zones, tourAppointments, reminders, cabinetAvailable: businessProfile.cabinetAvailable, homeAvailable: businessProfile.homeAvailable, availability };
}
