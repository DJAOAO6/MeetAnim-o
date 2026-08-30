import type { AnimalSpecies } from "@/data/species";

export type StatsPeriod = "current" | "previous" | "3months" | "6months" | "year" | "previousYear" | "custom";
export type StatsSpecies = "all" | AnimalSpecies;

export const periodOptions: Array<{ value: StatsPeriod; label: string }> = [
  { value: "current", label: "Ce mois-ci" },
  { value: "previous", label: "Mois dernier" },
  { value: "3months", label: "3 derniers mois" },
  { value: "6months", label: "6 derniers mois" },
  { value: "year", label: "Cette année" },
  { value: "previousYear", label: "Année dernière" },
  { value: "custom", label: "Période personnalisée" },
];

export const speciesOptions: Array<{ value: StatsSpecies; label: string }> = [
  { value: "all", label: "Toutes les espèces" },
  { value: "Chien", label: "Chien" },
  { value: "Chat", label: "Chat" },
  { value: "Cheval", label: "Cheval" },
  { value: "NAC", label: "NAC" },
  { value: "Petit ruminant", label: "Petit ruminant" },
];

export type StatsFilters = {
  period: StatsPeriod;
  serviceId: string; // "all" ou l'id réel d'un Service
  species: StatsSpecies;
  startDate: string; // utilisé seulement si period === "custom"
  endDate: string;
};

export type StatsData = {
  overview: {
    revenue: number;
    revenueVariationPct: number | null; // null si aucune donnée sur la période précédente équivalente
    consultations: number;
    newClients: number;
    homeConsultations: number;
  };
  revenueSeries: Array<{ label: string; value: number }>;
  consultationModes: Array<{ label: string; consultations: number; share: number; revenue: number }>;
  services: Array<{ label: string; consultations: number; revenue: number }>;
  species: Array<{ label: AnimalSpecies; value: number }>; // value = pourcentage
  sex: Array<{ label: string; value: number }>; // value = pourcentage
  ages: Array<{ label: string; value: number }>; // value = pourcentage
  breeds: Partial<Record<AnimalSpecies, { total: number; distinct: number; items: Array<{ label: string; value: number }> }>>;
  loyalty: { newClients: number; returningClients: number; returnRate: number; averageDelayMonths: number | null };
  cancellations: { totalBooked: number; honored: number; cancelled: number; cancellationRate: number };
  reminders: { sent: number; bookedAgain: number; returnRate: number };
  zones: Array<{ label: string; consultations: number; revenue: number; clients: number }>;
  home: { consultations: number; revenue: number; averageRevenue: number };
};
