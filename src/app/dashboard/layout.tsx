import type { ReactNode } from "react";
import { AppointmentsProvider } from "@/components/appointments/appointments-context";
import { GlobalAppointmentsManager } from "@/components/appointments/global-appointments-manager";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { DashboardFloatingActions } from "@/components/dashboard/dashboard-floating-actions";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-provider";
import { getAppointments } from "@/lib/appointments";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";

// L'espace dashboard est protégé par connexion et lit des données live en base :
// jamais de mise en cache statique, chaque visite doit refléter l'état réel.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  // Contrôle "sûr" en complément du contrôle optimiste du proxy : relit
  // l'utilisateur en base et invalide la session si le mot de passe a
  // changé ou si le compte a été désactivé depuis l'émission du cookie.
  const user = await requireUser();
  const appointments = await getAppointments();

  return (
    <CurrentUserProvider user={user}>
      <DashboardThemeProvider>
        <AppointmentsProvider initialAppointments={appointments}>
          <div className="min-h-screen bg-animeo-bg pt-16 text-animeo-text md:pl-64 md:pt-0">
            <DashboardSidebar showAdmin={user.role === "ADMIN"} showStatistics={hasPermission(user, "VIEW_FINANCES")} />
            <main className="mx-auto min-h-screen max-w-[1600px] p-4 sm:p-7 lg:p-10">
              {children}
            </main>
            <GlobalAppointmentsManager />
            <DashboardFloatingActions />
          </div>
        </AppointmentsProvider>
      </DashboardThemeProvider>
    </CurrentUserProvider>
  );
}
