import { DashboardView } from "@/components/dashboard/dashboard-view";
import { getDashboardOverviewData } from "@/lib/dashboard-overview";

export default async function DashboardPage() {
  const data = await getDashboardOverviewData();
  return <DashboardView {...data} />;
}
