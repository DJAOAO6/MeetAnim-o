import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppointmentsProvider } from "@/components/appointments/appointments-context";
import { GlobalAppointmentsManager } from "@/components/appointments/global-appointments-manager";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { DashboardFloatingActions } from "@/components/dashboard/dashboard-floating-actions";
import { DashboardRealtimeRefresh } from "@/components/dashboard/dashboard-realtime-refresh";
import { RemindersProvider } from "@/components/dashboard/reminders-context";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-provider";
import { getAppointments } from "@/lib/appointments";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getClientPickerOptions } from "@/lib/clients";
import { getReminders } from "@/lib/reminders";

// L'espace dashboard est protégé par connexion et lit des données live en base :
// jamais de mise en cache statique, chaque visite doit refléter l'état réel.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Contrôle "sûr" en complément du contrôle optimiste du proxy : relit
  // l'utilisateur en base et invalide la session si le mot de passe a
  // changé ou si le compte a été désactivé depuis l'émission du cookie.
  const user = await requireUser();
  const [appointments, clientOptions, reminders] = await Promise.all([getAppointments(), getClientPickerOptions(), getReminders()]);

  return (
    <CurrentUserProvider user={user}>
      <DashboardThemeProvider>
        <AppointmentsProvider initialAppointments={appointments}>
          <RemindersProvider initialReminders={reminders}>
            <div className="min-h-screen bg-animeo-bg pt-16 text-animeo-text md:pl-64 md:pt-0">
              <DashboardSidebar showAdmin={user.role === "ADMIN"} showStatistics={hasPermission(user, "VIEW_FINANCES")} />
              <main className="mx-auto min-h-screen max-w-[1600px] p-4 sm:p-7 lg:p-10">
                {children}
              </main>
              <GlobalAppointmentsManager clients={clientOptions} />
              <DashboardFloatingActions />
              <DashboardRealtimeRefresh />
              {/* Un seul montage pour tout le dashboard (PROMPT-NOTIFICATIONS.md §A3) —
                  voir src/lib/notify.ts, jamais importé directement ailleurs. Habillé
                  avec les tokens du projet plutôt que le richColors intégré de Sonner
                  (sa propre palette, pas la nôtre). */}
              <Toaster
                position="top-right"
                closeButton
                toastOptions={{
                  classNames: {
                    toast: "!rounded-2xl !border !shadow-[0_12px_32px_rgba(24,59,69,0.16)] !font-extrabold",
                    success: "!bg-animeo-success !text-white !border-animeo-success",
                    error: "!bg-animeo-error !text-white !border-animeo-error",
                    info: "!bg-animeo-info !text-white !border-animeo-info",
                    closeButton: "!bg-white/20 !border-white/40 !text-white",
                  },
                }}
              />
            </div>
          </RemindersProvider>
        </AppointmentsProvider>
      </DashboardThemeProvider>
    </CurrentUserProvider>
  );
}
