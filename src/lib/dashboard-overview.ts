import "server-only";
import { getClients } from "@/lib/clients";
import { getReminders } from "@/lib/reminders";
import { getTourAppointments, getTours, getZones } from "@/lib/tours";
import type { Client } from "@/data/clients";
import type { Reminder } from "@/data/reminders";
import type { Tour, TourAppointment, Zone } from "@/data/tours";

export type DashboardOverviewData = {
  clients: Client[];
  tours: Tour[];
  zones: Zone[];
  tourAppointments: Record<string, TourAppointment[]>;
  reminders: Reminder[];
};

export async function getDashboardOverviewData(): Promise<DashboardOverviewData> {
  const [clients, tours, zones, tourAppointments, reminders] = await Promise.all([
    getClients(),
    getTours(),
    getZones(),
    getTourAppointments(),
    getReminders(),
  ]);

  return { clients, tours, zones, tourAppointments, reminders };
}
