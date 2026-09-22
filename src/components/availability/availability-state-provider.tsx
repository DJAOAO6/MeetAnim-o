"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { AvailabilityManager } from "@/components/availability/availability-manager";
import type { AvailabilityMode } from "@/lib/availability-status";
import type { AvailabilitySettings } from "@/data/settings";
import type { PracticeMode } from "@/lib/practice-mode";

type AvailabilityStateValue = {
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  practiceMode: PracticeMode;
  availability: AvailabilitySettings;
  /** Ouvre le gestionnaire sur l'onglet du mode demandé. */
  manage: (mode: AvailabilityMode) => void;
};

const AvailabilityStateContext = createContext<AvailabilityStateValue | null>(null);

/**
 * État d'ouverture partagé par les cartes Cabinet et Domicile.
 *
 * Elles sont deux blocs indépendants du tableau de bord — on peut les
 * déplacer, les redimensionner, en masquer un — mais elles décrivent un seul
 * et même état : une fermeture « Tout fermer » saisie depuis l'une concerne
 * aussi l'autre. Chacune gardant sa propre copie, l'une serait restée
 * affichée « ouvert » après une fermeture décidée depuis sa voisine.
 *
 * Le gestionnaire est monté ici une seule fois, pour la même raison.
 */
export function AvailabilityStateProvider({ cabinetAvailable, homeAvailable, practiceMode, availability, children }: {
  cabinetAvailable: boolean;
  homeAvailable: boolean;
  practiceMode: PracticeMode;
  availability: AvailabilitySettings;
  children: ReactNode;
}) {
  const [cabinet, setCabinet] = useState(cabinetAvailable);
  const [home, setHome] = useState(homeAvailable);
  const [settings, setSettings] = useState(availability);
  const [managing, setManaging] = useState<AvailabilityMode | null>(null);

  const manage = useCallback((mode: AvailabilityMode) => setManaging(mode), []);

  const value = useMemo<AvailabilityStateValue>(
    () => ({ cabinetAvailable: cabinet, homeAvailable: home, practiceMode, availability: settings, manage }),
    [cabinet, home, practiceMode, settings, manage],
  );

  return (
    <AvailabilityStateContext.Provider value={value}>
      {children}
      {managing ? (
        <AvailabilityManager
          initialMode={managing}
          cabinetAvailable={cabinet}
          practiceMode={practiceMode}
          homeAvailable={home}
          availability={settings}
          onClose={() => setManaging(null)}
          onApplied={(next) => {
            setCabinet(next.cabinetAvailable);
            setHome(next.homeAvailable);
            setSettings(next.availability);
          }}
        />
      ) : null}
    </AvailabilityStateContext.Provider>
  );
}

export function useAvailabilityState(): AvailabilityStateValue {
  const context = useContext(AvailabilityStateContext);
  if (!context) throw new Error("useAvailabilityState doit être utilisé dans AvailabilityStateProvider.");
  return context;
}
