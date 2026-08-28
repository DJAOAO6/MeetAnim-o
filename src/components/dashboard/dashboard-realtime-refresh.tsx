"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

const REFRESH_INTERVAL_MS = 60_000;

/**
 * PROMPT-NOTIFICATIONS.md §B3, option 1 (retenue) : rafraîchissement
 * périodique plutôt que SSE/WebSocket — le volume est faible et le besoin
 * est de voir arriver une demande dans la minute, pas à la milliseconde.
 * router.refresh() relance les Server Components (layout + page), ce qui
 * fait remonter des `initialAppointments`/`initialReminders` frais jusqu'à
 * AppointmentsProvider et RemindersProvider (qui s'y resynchronisent).
 * Ne tourne que si l'onglet est visible, pour ne pas solliciter Neon en
 * arrière-plan quand personne ne regarde l'écran.
 */
export function DashboardRealtimeRefresh() {
  const router = useRouter();

  useEffect(() => {
    function refreshIfVisible() {
      if (document.visibilityState === "visible") router.refresh();
    }

    const interval = window.setInterval(refreshIfVisible, REFRESH_INTERVAL_MS);
    document.addEventListener("visibilitychange", refreshIfVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  return null;
}
