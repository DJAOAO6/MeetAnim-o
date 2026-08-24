import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Paramètres" };

export default function ParametresPage() {
  return (
    <FeaturePlaceholder
      title="Paramètres"
      description="Personnalisez votre activité, vos lieux de consultation et votre page de réservation."
      icon="settings"
      features={[
        "Informations du professionnel",
        "Horaires Cabinet et Domicile",
        "Préférences de réservation",
        "Configuration de la page publique",
      ]}
    />
  );
}
