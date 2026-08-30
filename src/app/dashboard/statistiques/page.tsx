import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { StatsView } from "@/components/stats/stats-view";
import { requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { getStatsData, getStatsServiceOptions } from "@/lib/stats";
import type { StatsFilters } from "@/data/stats";

export const metadata: Metadata = { title: "Statistiques" };

const defaultFilters: StatsFilters = { period: "current", serviceId: "all", species: "all", startDate: "", endDate: "" };

export default async function StatisticsPage() {
  const user = await requireUser();
  if (!hasPermission(user, "VIEW_FINANCES")) redirect("/dashboard");

  const [initialStats, serviceOptions] = await Promise.all([
    getStatsData(defaultFilters),
    getStatsServiceOptions(),
  ]);

  return <StatsView initialStats={initialStats} initialFilters={defaultFilters} serviceOptions={serviceOptions} />;
}
