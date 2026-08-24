import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Tournées" };

export default function TourneesPage() {
  return (
    <FeaturePlaceholder
      title="Tournées"
      description="Regroupez vos rendez-vous à domicile par secteur géographique."
      icon="tournees"
      features={[
        "Création de zones géographiques",
        "Planification d’une journée de tournée",
        "Liste ordonnée des rendez-vous",
        "Estimation simple des déplacements",
      ]}
    />
  );
}
