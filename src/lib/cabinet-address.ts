/**
 * Adresse du cabinet en une ligne lisible.
 *
 * L'adresse enregistrée vient de l'autocomplétion et contient déjà, le plus
 * souvent, le code postal et la ville : les rajouter donnait « 453 Boulevard
 * de l'Europe 76360 Barentin, 76360 Barentin ». On ne complète donc que ce
 * qui manque vraiment.
 */
export function composeCabinetAddress(address: string, postalCode: string, city: string): string {
  const line = address.trim();
  const suffix = [postalCode.trim(), city.trim()].filter(Boolean).join(" ");
  if (!line) return suffix;
  if (!suffix || line.includes(postalCode.trim()) || line.toLocaleLowerCase("fr-FR").includes(city.trim().toLocaleLowerCase("fr-FR"))) return line;
  return `${line}, ${suffix}`;
}
