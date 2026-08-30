import "server-only";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { getClients } from "@/lib/clients";
import { getReminders } from "@/lib/reminders";
import { getTours, getTourStops, getZones } from "@/lib/tours";
import type { Client } from "@/data/clients";
import type { Reminder } from "@/data/reminders";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

export type DashboardOverviewData = {
  clients: Client[];
  tours: Tour[];
  zones: Zone[];
  tourAppointments: Record<string, TourAppointment[]>;
  reminders: Reminder[];
  cabinetAvailable: boolean;
  homeAvailable: boolean;
};

export async function getDashboardOverviewData(): Promise<DashboardOverviewData> {
  const [clients, tours, zones, tourAppointments, reminders, businessProfile] = await Promise.all([
    getClients(),
    getTours(),
    getZones(),
    getTourStops(),
    getReminders(),
    getBusinessProfile(),
  ]);

  return { clients, tours, zones, tourAppointments, reminders, cabinetAvailable: businessProfile.cabinetAvailable, homeAvailable: businessProfile.homeAvailable };
}
