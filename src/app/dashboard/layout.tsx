import type { ReactNode } from "react";
import { AppointmentsProvider } from "@/components/appointments/appointments-context";
import { GlobalAppointmentsManager } from "@/components/appointments/global-appointments-manager";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <AppointmentsProvider>
      <div className="min-h-screen bg-animeo-bg pl-20 text-[#1f2933] md:pl-72">
        <DashboardSidebar />
        <main className="mx-auto min-h-screen max-w-[1600px] p-4 sm:p-7 lg:p-10">
          {children}
        </main>
        <GlobalAppointmentsManager />
      </div>
    </AppointmentsProvider>
  );
}
