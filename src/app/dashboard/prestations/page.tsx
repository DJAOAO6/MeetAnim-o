import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Prestations" };

export default function PrestationsPage() {
  return (
    <FeaturePlaceholder
      title="Prestations"
      description="Définissez vos services et adaptez vos tarifs selon le lieu du rendez-vous."
      icon="services"
      features={[
        "Prix Cabinet et Domicile distincts",
        "Frais de déplacement optionnels",
        "Montant fixe ou tarif par zone",
        "Activation par prestation",
      ]}
    />
  );
}
