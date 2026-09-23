import type { Metadata } from "next";
import { RemindersView } from "@/components/reminders/reminders-view";
import { getReminderClientOptions, getReminders, getReminderStats } from "@/lib/reminders";
import { getBusinessProfile, getReminderSettings } from "@/lib/business-profile-actions";
import { ModuleClosed } from "@/components/modules/module-closed";
import { hasModule } from "@/lib/modules";
import { requireUser } from "@/lib/auth/dal";

export const metadata: Metadata = { title: "Rappels clients" };

export default async function RappelsPage() {
  const moduleUser = await requireUser();
  if (!hasModule(moduleUser.modules, "REMINDERS")) return <ModuleClosed moduleKey="REMINDERS" />;
  const [reminders, stats, clientOptions, profile, reminderSettings] = await Promise.all([
    getReminders(),
    getReminderStats(),
    getReminderClientOptions(),
    getBusinessProfile(),
    getReminderSettings(),
  ]);

  return <RemindersView initialReminders={reminders} initialStats={stats} clientOptions={clientOptions} professionalSlug={profile.slug} messageTemplate={reminderSettings.messageTemplate} />;
}
