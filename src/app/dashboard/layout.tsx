import type { ReactNode } from "react";
import { Toaster } from "sonner";
import { AppointmentsProvider } from "@/components/appointments/appointments-context";
import { GlobalAppointmentsManager } from "@/components/appointments/global-appointments-manager";
import { CurrentUserProvider } from "@/components/auth/current-user-provider";
import { DashboardFloatingActions } from "@/components/dashboard/dashboard-floating-actions";
import { DashboardRealtimeRefresh } from "@/components/dashboard/dashboard-realtime-refresh";
import { RemindersProvider } from "@/components/dashboard/reminders-context";
import { DashboardSidebar } from "@/components/layout/dashboard-sidebar";
import { SidebarProvider } from "@/components/layout/sidebar-provider";
import { MobileBottomNav } from "@/components/layout/mobile-bottom-nav";
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
      <SidebarProvider>
        <DashboardThemeProvider>
        <AppointmentsProvider initialAppointments={appointments}>
          <RemindersProvider initialReminders={reminders}>
            {/* overflow-x-clip : la page elle-même ne défile jamais
                latéralement. Les conteneurs qui en ont besoin (tableaux
                larges, planning, barre d'onglets) gardent leur propre
                défilement horizontal — `clip` plutôt que `hidden` pour ne pas
                créer un conteneur de défilement, ce qui casserait les
                éléments `sticky` (colonne des heures, en-têtes de tableaux).
                Sans cette règle, un seul élément trop large suffisait à faire
                glisser toute l'interface de côté. */}
            {/* Le décalage suit la largeur réelle de la barre latérale, la
                même variable que celle-ci applique : réduire le menu rend
                l'espace au contenu, sans bande vide ni recouvrement, et sans
                qu'aucune page ait à connaître l'existence de la barre.
                `md:` seulement : sous ce seuil la navigation est un tiroir
                posé par-dessus le contenu. */}
            <div className="min-h-screen overflow-x-clip bg-animeo-bg pt-16 text-animeo-text transition-[padding] duration-200 ease-out md:pl-[var(--sidebar-width,260px)] md:pt-0">
              <DashboardSidebar showAdmin={user.role === "ADMIN"} showStatistics={hasPermission(user, "VIEW_FINANCES")} />
              {/* pb-24 sous md : dégagement pour la barre de navigation
                  fixe du bas, sinon elle recouvre la fin du contenu. */}
              <main className="mx-auto min-h-screen max-w-[1600px] p-4 pb-24 sm:p-7 lg:p-10 md:pb-7 lg:pb-10">
                {children}
              </main>
              <GlobalAppointmentsManager clients={clientOptions} />
              <DashboardFloatingActions />
              <MobileBottomNav />
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
                    toast: "!rounded-2xl !border !shadow-[0_12px_32px_rgb(var(--theme-shadow-rgb)/0.16)] !font-extrabold",
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
      </SidebarProvider>
    </CurrentUserProvider>
  );
}
