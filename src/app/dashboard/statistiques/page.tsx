import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StatsView } from "@/components/stats/stats-view";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";

export const metadata: Metadata = { title: "Statistiques" };

export default async function StatisticsPage() {
  const user = await requireUser();
  if (!hasPermission(user, "VIEW_FINANCES")) redirect("/dashboard");

  return <StatsView />;
}
