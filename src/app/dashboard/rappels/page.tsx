import type { Metadata } from "next";
import { RemindersView } from "@/components/reminders/reminders-view";
import { getReminderClientOptions, getReminders, getReminderStats } from "@/lib/reminders";

export const metadata: Metadata = { title: "Rappels clients" };

export default async function RappelsPage() {
  const [reminders, stats, clientOptions] = await Promise.all([
    getReminders(),
    getReminderStats(),
    getReminderClientOptions(),
  ]);

  return <RemindersView initialReminders={reminders} initialStats={stats} clientOptions={clientOptions} />;
}
