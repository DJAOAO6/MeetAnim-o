import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardLayout } from "@/lib/dashboard-layout-actions";
import { getDashboardOverviewData } from "@/lib/dashboard-overview";

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  // Disposition lue côté serveur : le tableau de bord s'affiche directement
  // dans l'ordre choisi par l'utilisateur, sans réagencement visible après
  // l'hydratation.
  const [data, initialLayout, params] = await Promise.all([getDashboardOverviewData(), getDashboardLayout(), searchParams]);
  // Ouvert depuis Paramètres › Personnalisation (lien ?personnaliser=1).
  return <DashboardView {...data} initialLayout={initialLayout} startEditing={params?.personnaliser === "1"} />;
}
