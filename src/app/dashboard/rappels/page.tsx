import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Rappels clients" };

export default function RappelsPage() {
  return (
    <FeaturePlaceholder
      title="Rappels clients"
      description="Gardez le lien avec vos clients au bon moment, sans oublier un suivi."
      icon="bell"
      features={[
        "Rappel à 3, 6 ou 12 mois",
        "Date de rappel personnalisée",
        "Liste des rappels à venir",
        "Envoi automatique prévu plus tard",
      ]}
    />
  );
}
