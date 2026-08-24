import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Agenda" };

export default function AgendaPage() {
  return (
    <FeaturePlaceholder
      title="Agenda"
      description="Organisez vos rendez-vous au cabinet et à domicile depuis un agenda unique."
      icon="agenda"
      features={[
        "Vue jour, semaine et mois",
        "Ouverture indépendante Cabinet / Domicile",
        "Validation ou refus d’une demande",
        "Proposition d’un autre créneau",
      ]}
    />
  );
}
