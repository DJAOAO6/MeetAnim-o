import "server-only";

// Ré-export fin : la logique d'appel Géoplateforme vit désormais dans
// src/lib/maps/geocoding-provider.ts (partagée avec l'éditeur de tournées).
// Ce fichier ne fait qu'exposer l'API historique attendue par
// business-profile-actions.ts et /api/address-search — GeocodeSuggestion et
// GeocodedAddress (src/data/geocoding.ts) sont structurellement identiques.
export { normalizeGeocodedFeatures, geocodeAddress } from "@/lib/maps/geocoding-provider";
