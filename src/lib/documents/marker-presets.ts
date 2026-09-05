// Studio de documents — préréglages de repères pour le schéma animalier
// (étape 4). Partagés par tout le cabinet (comme le reste de
// BusinessProfile), pas propres à un utilisateur — un repère "Restriction"
// doit vouloir dire la même chose pour toute l'équipe.

export type MarkerPreset = {
  id: string;
  label: string;
  color: string;
};

export const DEFAULT_MARKER_PRESETS: MarkerPreset[] = [
  { id: "restriction", label: "Restriction", color: "#d1554f" },
  { id: "tension", label: "Tension", color: "#e0a83f" },
  { id: "zone-travaillee", label: "Zone travaillée", color: "#4FAF9F" },
  { id: "mobilite-retrouvee", label: "Mobilité retrouvée", color: "#3f7fc4" },
  { id: "a-surveiller", label: "À surveiller", color: "#9a6fd6" },
];

export function labelForPreset(presetId: string, presets: MarkerPreset[]): string {
  return presets.find((preset) => preset.id === presetId)?.label ?? presetId;
}

export function colorForPreset(presetId: string, presets: MarkerPreset[]): string {
  return presets.find((preset) => preset.id === presetId)?.color ?? "#183b45";
}
