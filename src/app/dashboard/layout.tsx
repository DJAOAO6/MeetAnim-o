import type { ReactNode } from "react";
import { AppointmentsProvider } from "@/components/appointments/appointments-context";
import { GlobalAppointmentsManager } from "@/components/appointments/global-appointments-manager";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { DashboardThemeProvider } from "@/components/theme/dashboard-theme-provider";
import { getAppointments } from "@/lib/appointments";

// L'espace dashboard est protégé par connexion et lit des données live en base :
// jamais de mise en cache statique, chaque visite doit refléter l'état réel.
export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: ReactNode }) {
  const appointments = await getAppointments();

  return (
    <DashboardThemeProvider>
      <AppointmentsProvider initialAppointments={appointments}>
        <div className="min-h-screen bg-animeo-bg pt-16 text-animeo-text md:pl-64 md:pt-0">
          <DashboardSidebar />
          <main className="mx-auto min-h-screen max-w-[1600px] p-4 sm:p-7 lg:p-10">
            {children}
          </main>
          <GlobalAppointmentsManager />
        </div>
      </AppointmentsProvider>
    </DashboardThemeProvider>
  );
}
