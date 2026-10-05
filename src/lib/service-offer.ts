/**
 * Où une prestation est proposée, en une ligne : « 60 € au cabinet · 70 € à
 * domicile » quand elle l'est des deux façons ; « Cabinet uniquement · 60 € »
 * quand le professionnel pratique les deux mais ne la propose qu'au cabinet.
 * Pour qui n'exerce que d'une façon, « uniquement » ne dirait rien de plus.
 */
export function serviceOfferLabel(service: { cabinetEnabled: boolean; cabinetPrice: number; homeEnabled: boolean; homePrice: number }, practicesBoth: boolean): string {
  const price = (value: number) => `${value} €`;
  if (service.cabinetEnabled && service.homeEnabled) return `${price(service.cabinetPrice)} au cabinet · ${price(service.homePrice)} à domicile`;
  if (service.cabinetEnabled) return practicesBoth ? `Cabinet uniquement · ${price(service.cabinetPrice)}` : `${price(service.cabinetPrice)} au cabinet`;
  if (service.homeEnabled) return practicesBoth ? `Domicile uniquement · ${price(service.homePrice)}` : `${price(service.homePrice)} à domicile`;
  return "Proposée nulle part";
}
