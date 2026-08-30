import type { Metadata } from "next";
import { RemindersView } from "@/components/reminders/reminders-view";
import { getReminderClientOptions, getReminders, getReminderStats } from "@/lib/reminders";
import { getBusinessProfile } from "@/lib/business-profile-actions";

export const metadata: Metadata = { title: "Rappels clients" };

export default async function RappelsPage() {
  const [reminders, stats, clientOptions, profile] = await Promise.all([
    getReminders(),
    getReminderStats(),
    getReminderClientOptions(),
    getBusinessProfile(),
  ]);

  return <RemindersView initialReminders={reminders} initialStats={stats} clientOptions={clientOptions} professionalSlug={profile.slug} />;
}
