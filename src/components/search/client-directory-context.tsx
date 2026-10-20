"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { ClientPickerOption } from "@/data/clients";
import { getClientDirectoryAction } from "@/lib/client-directory-actions";

/**
 * Les clients de l'espace et leurs animaux, pour la recherche de l'en-tête
 * et le formulaire de rendez-vous, qui les classent sur place sans requête
 * à chaque frappe (src/lib/fuzzy-match.ts).
 *
 * Chargés à la demande, jamais avec la page (audit 2026-10, RGPD-08) :
 * l'annuaire ne quitte le serveur que quand quelqu'un cherche un client ou
 * ouvre un rendez-vous, et chaque usage le relit pour voir les fiches
 * créées entre-temps.
 */
type ClientDirectory = {
  clients: ClientPickerOption[];
  /** L'annuaire a été lu au moins une fois. */
  ready: boolean;
  /** Relit l'annuaire ; une seule lecture à la fois, partagée. */
  refresh: () => Promise<ClientPickerOption[]>;
};

const ClientDirectoryContext = createContext<ClientDirectory>({ clients: [], ready: false, refresh: async () => [] });

export function ClientDirectoryProvider({ children }: { children: ReactNode }) {
  const [clients, setClients] = useState<ClientPickerOption[]>([]);
  const [ready, setReady] = useState(false);
  const inFlight = useRef<Promise<ClientPickerOption[]> | null>(null);

  const refresh = useCallback(() => {
    if (!inFlight.current) {
      inFlight.current = getClientDirectoryAction()
        .then((list) => {
          setClients(list);
          setReady(true);
          return list;
        })
        .finally(() => {
          inFlight.current = null;
        });
    }
    return inFlight.current;
  }, []);

  const value = useMemo(() => ({ clients, ready, refresh }), [clients, ready, refresh]);
  return <ClientDirectoryContext.Provider value={value}>{children}</ClientDirectoryContext.Provider>;
}

export function useClientDirectory(): ClientDirectory {
  return useContext(ClientDirectoryContext);
}

/**
 * L'annuaire relu à l'ouverture du composant qui l'appelle (`fresh` passe à
 * vrai une fois la lecture faite, réussie ou non). Pour un formulaire qui
 * calcule son état de départ à partir des clients : il ne doit pas
 * s'afficher avec une liste vide ou périmée.
 */
export function useFreshClientDirectory(): { clients: ClientPickerOption[]; fresh: boolean } {
  const { clients, refresh } = useClientDirectory();
  const [fresh, setFresh] = useState(false);
  useEffect(() => {
    let alive = true;
    refresh().catch(() => []).then(() => {
      if (alive) setFresh(true);
    });
    return () => {
      alive = false;
    };
  }, [refresh]);
  return { clients, fresh };
}
