"use client";

import { useEffect, useState } from "react";

export type GeolocationCoordinates = { lat: number; lng: number };

/**
 * Position réelle du praticien via l'API Geolocation du navigateur —
 * jamais activée sans geste explicite de l'utilisateur (voir `enabled`),
 * une demande d'autorisation au chargement de la page serait intrusive.
 * watchPosition plutôt qu'un simple relevé unique : le praticien se déplace
 * pendant une tournée, une position figée au premier appel serait vite
 * fausse.
 */
export function useGeolocation(enabled: boolean): { position: GeolocationCoordinates | null; error: string | null } {
  const [position, setPosition] = useState<GeolocationCoordinates | null>(null);
  const [watchError, setWatchError] = useState<string | null>(null);
  // Capacité de l'environnement, pas un état réactif : dérivée au rendu
  // plutôt que posée via setState dans l'effet (react-hooks/set-state-in-effect).
  const unsupported = typeof navigator === "undefined" || !navigator.geolocation;

  useEffect(() => {
    if (!enabled || unsupported) return;

    const watchId = navigator.geolocation.watchPosition(
      (result) => {
        setWatchError(null);
        setPosition({ lat: result.coords.latitude, lng: result.coords.longitude });
      },
      () => {
        setPosition(null);
        setWatchError("Position indisponible — vérifiez l’autorisation de localisation du navigateur.");
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled, unsupported]);

  // Dérivé au rendu plutôt que réinitialisé par un effet : la position brute
  // reste en mémoire pendant que `enabled` est faux, simplement masquée ici
  // — le prochain relevé de watchPosition l'écrase de toute façon à la
  // réactivation.
  if (!enabled) return { position: null, error: null };
  return { position, error: unsupported ? "La géolocalisation n’est pas disponible sur cet appareil." : watchError };
}
