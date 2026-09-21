/**
 * Mode d'exercice : la manière dont le professionnel travaille, et elle ne
 * change pas d'un jour à l'autre — à domicile uniquement, au cabinet
 * uniquement, ou les deux.
 *
 * À ne pas confondre avec `cabinetAvailable` / `homeAvailable`, qui ferment
 * *temporairement* l'un ou l'autre (congés, cabinet en travaux). Ne pas
 * avoir de cabinet n'est pas l'avoir fermé : dans le premier cas il ne faut
 * rien annoncer du tout, dans le second on annonce une fermeture.
 *
 * Tous ceux qui n'ont pas de cabinet partent quand même de quelque part :
 * leur domicile, un local, une écurie. C'est le « point de départ », qui
 * remplace l'adresse du cabinet pour les tournées et les trajets, et qui
 * n'est jamais affiché publiquement.
 */
export type PracticeMode = "HOME_ONLY" | "OFFICE_ONLY" | "BOTH";

export const PRACTICE_MODES: { value: PracticeMode; label: string; description: string }[] = [
  { value: "BOTH", label: "Les deux", description: "Vous recevez au cabinet et vous vous déplacez." },
  { value: "HOME_ONLY", label: "À domicile uniquement", description: "Vous vous déplacez chez vos clients, sans cabinet." },
  { value: "OFFICE_ONLY", label: "Au cabinet uniquement", description: "Vos clients viennent à vous, vous ne vous déplacez pas." },
];

/** Reçoit-il au cabinet ? Faux quand il n'en a pas. */
export function hasCabinet(mode: PracticeMode): boolean {
  return mode !== "HOME_ONLY";
}

/** Se déplace-t-il chez les clients ? */
export function visitsHomes(mode: PracticeMode): boolean {
  return mode !== "OFFICE_ONLY";
}

/**
 * D'où partent les trajets et les tournées : l'adresse du cabinet quand il y
 * en a un, sinon le point de départ privé. `null` si rien n'est renseigné —
 * l'itinéraire démarre alors au premier arrêt, comme aujourd'hui.
 */
export function departurePoint(profile: {
  practiceMode: PracticeMode;
  address: string;
  postalCode: string;
  city: string;
  latitude: number | null;
  longitude: number | null;
  departureLabel: string | null;
  departureAddress: string | null;
  departureLatitude: number | null;
  departureLongitude: number | null;
}): { label: string; address: string; latitude: number | null; longitude: number | null } | null {
  if (hasCabinet(profile.practiceMode)) {
    const address = [profile.address, profile.postalCode, profile.city].map((part) => part.trim()).filter(Boolean).join(" ");
    if (!address) return null;
    return { label: "Cabinet", address, latitude: profile.latitude, longitude: profile.longitude };
  }
  const address = profile.departureAddress?.trim();
  if (!address) return null;
  return {
    label: profile.departureLabel?.trim() || "Point de départ",
    address,
    latitude: profile.departureLatitude,
    longitude: profile.departureLongitude,
  };
}
