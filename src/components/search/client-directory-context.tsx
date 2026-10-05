"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { ClientPickerOption } from "@/data/clients";

/**
 * Les clients de l'espace et leurs animaux, déjà chargés par la mise en
 * page pour le formulaire de rendez-vous (getClientPickerOptions). Partagés
 * ici pour que la recherche de l'en-tête les classe sur place, sans
 * requête à chaque frappe (src/lib/fuzzy-match.ts).
 */
const ClientDirectoryContext = createContext<ClientPickerOption[]>([]);

export function ClientDirectoryProvider({ clients, children }: { clients: ClientPickerOption[]; children: ReactNode }) {
  return <ClientDirectoryContext.Provider value={clients}>{children}</ClientDirectoryContext.Provider>;
}

export function useClientDirectory(): ClientPickerOption[] {
  return useContext(ClientDirectoryContext);
}
