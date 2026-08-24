import type { Metadata } from "next";
import { FeaturePlaceholder } from "@/components/pages/feature-placeholder";

export const metadata: Metadata = { title: "Clients et animaux" };

export default function ClientsPage() {
  return (
    <FeaturePlaceholder
      title="Clients & animaux"
      description="Retrouvez chaque client, ses animaux et le suivi complet de vos consultations."
      icon="clients"
      features={[
        "Plusieurs animaux par client",
        "Historique des consultations",
        "Notes privées sur les fiches animaux",
        "Documents associés à chaque animal",
      ]}
    />
  );
}
