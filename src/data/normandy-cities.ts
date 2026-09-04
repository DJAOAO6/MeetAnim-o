export type NormandyCity = {
  name: string;
  postalCode: string;
  lat: number;
  lng: number;
  zone: string;
};

export const NORMANDY_CITIES: NormandyCity[] = [
  { name: "Rouen", postalCode: "76000", lat: 49.4432, lng: 1.0999, zone: "Zone Rouen Nord" },
  { name: "Mont-Saint-Aignan", postalCode: "76130", lat: 49.4644, lng: 1.0772, zone: "Zone Rouen Nord" },
  { name: "Bois-Guillaume", postalCode: "76230", lat: 49.4644, lng: 1.1064, zone: "Zone Rouen Nord" },
  { name: "Bihorel", postalCode: "76420", lat: 49.4589, lng: 1.1103, zone: "Zone Rouen Nord" },
  { name: "Le Havre", postalCode: "76600", lat: 49.4938, lng: 0.1077, zone: "Zone Le Havre" },
  { name: "Montivilliers", postalCode: "76290", lat: 49.5459, lng: 0.1875, zone: "Zone Le Havre" },
  { name: "Harfleur", postalCode: "76700", lat: 49.5, lng: 0.2, zone: "Zone Le Havre" },
  { name: "Gonfreville-l’Orcher", postalCode: "76700", lat: 49.5, lng: 0.2333, zone: "Zone Le Havre" },
  { name: "Dieppe", postalCode: "76200", lat: 49.9219, lng: 1.0771, zone: "Zone Dieppe" },
  { name: "Offranville", postalCode: "76550", lat: 49.8994, lng: 1.0499, zone: "Zone Dieppe" },
  { name: "Rouxmesnil-Bouteilles", postalCode: "76370", lat: 49.9167, lng: 1.1, zone: "Zone Dieppe" },
  { name: "Louviers", postalCode: "27400", lat: 49.2167, lng: 1.1667, zone: "Zone Vallée de l’Eure" },
  { name: "Val-de-Reuil", postalCode: "27100", lat: 49.2667, lng: 1.2167, zone: "Zone Vallée de l’Eure" },
];
