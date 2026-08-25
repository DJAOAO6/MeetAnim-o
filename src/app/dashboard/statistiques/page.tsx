import type { Metadata } from "next";
import { StatsView } from "@/components/stats/stats-view";

export const metadata: Metadata = { title: "Statistiques" };

export default function StatisticsPage() {
  return <StatsView />;
}
