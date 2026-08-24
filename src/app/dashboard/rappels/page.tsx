import type { Metadata } from "next";
import { RemindersView } from "@/components/reminders/reminders-view";
import { initialReminders, initialReminderStats } from "@/data/reminders";

export const metadata: Metadata = { title: "Rappels clients" };

export default function RappelsPage() {
  return <RemindersView initialReminders={initialReminders} initialStats={initialReminderStats} />;
}
