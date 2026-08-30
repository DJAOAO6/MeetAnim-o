"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { Reminder } from "@/data/reminders";

type RemindersContextValue = {
  reminders: Reminder[];
};

const RemindersContext = createContext<RemindersContextValue | null>(null);

/**
 * Miroir en lecture seule des rappels, monté une fois dans le layout dashboard
 * (comme AppointmentsProvider) pour que la cloche de notifications y accède
 * sans faire transiter `reminders` en prop à travers HeaderActions. Les
 * mutations (marquer envoyé, ignorer…) restent gérées localement par
 * reminders-view.tsx, qui a son propre état optimiste — ce contexte se
 * resynchronise simplement sur les données fraîches renvoyées par le serveur
 * à chaque re-rendu du layout (navigation ou router.refresh() périodique),
 * en ajustant l'état pendant le rendu plutôt que dans un effet.
 */
export function RemindersProvider({ children, initialReminders }: { children: ReactNode; initialReminders: Reminder[] }) {
  const [reminders, setReminders] = useState<Reminder[]>(initialReminders);
  const [syncedInitialReminders, setSyncedInitialReminders] = useState(initialReminders);
  if (initialReminders !== syncedInitialReminders) {
    setSyncedInitialReminders(initialReminders);
    setReminders(initialReminders);
  }

  return <RemindersContext.Provider value={{ reminders }}>{children}</RemindersContext.Provider>;
}

export function useReminders() {
  const context = useContext(RemindersContext);
  if (!context) throw new Error("useReminders doit être utilisé dans RemindersProvider");
  return context;
}
