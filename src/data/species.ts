export type AnimalSpecies = "Chien" | "Chat" | "Cheval" | "NAC" | "Petit ruminant";

export const animalSpeciesList: AnimalSpecies[] = ["Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];

export const defaultSpeciesColors: Record<AnimalSpecies, string> = {
  Chien: "#4FAF9F",
  Chat: "#5B8DEF",
  Cheval: "#F4B860",
  NAC: "#8067B0",
  "Petit ruminant": "#C97B4A",
};

export function resolveSpeciesColor(colors: Partial<Record<AnimalSpecies, string>>, species: AnimalSpecies): string {
  return colors[species] ?? defaultSpeciesColors[species];
}
