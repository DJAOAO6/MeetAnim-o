import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Carte clients" };

export default function CartePage() {
  return (
    <FeaturePlaceholder
      title="Carte clients"
      description="Visualisez la répartition géographique de votre clientèle et préparez vos secteurs."
      icon="map"
      features={[
        "Carte de tous les clients",
        "Repères par adresse",
        "Filtrage par zone de tournée",
        "Connexion Mapbox prévue plus tard",
      ]}
    />
  );
}
