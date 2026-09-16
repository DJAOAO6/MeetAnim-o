import type { NavigationAssetKey } from "@/data/dashboard-theme";

/**
 * Plan de navigation du tableau de bord, regroupé par métier plutôt qu'en une
 * liste plate : huit entrées de même poids demandaient de tout relire à chaque
 * fois. « Tableau de bord » reste hors catégorie, c'est le point de départ.
 *
 * `assetKey` fait le lien avec les icônes personnalisées du thème
 * (Personnalisation) : une image choisie par le cabinet remplace alors
 * l'icône livrée, sans rien changer ici.
 */
export type NavigationEntry = {
  label: string;
  href: string;
  /** Nom d'icône Lucide, résolu dans dashboard-sidebar.tsx. */
  icon: NavigationIconName;
  assetKey: NavigationAssetKey;
  /** Réservé aux comptes qui voient les chiffres (permission VIEW_FINANCES). */
  requiresFinances?: boolean;
};

export type NavigationIconName =
  | "layoutDashboard"
  | "calendarDays"
  | "route"
  | "bellRing"
  | "users"
  | "mapPinned"
  | "briefcase"
  | "fileText"
  | "chartColumn";

export type GroupIconName = "calendarRange" | "usersRound" | "briefcaseBusiness" | "chartTrend";

export type NavigationGroup = {
  id: string;
  label: string;
  /** Icône de la catégorie, légèrement plus marquée que celles des pages. */
  icon: GroupIconName;
  items: NavigationEntry[];
};

export const dashboardEntry: NavigationEntry = {
  label: "Tableau de bord",
  href: "/dashboard",
  icon: "layoutDashboard",
  assetKey: "dashboard",
};

export const navigationGroups: NavigationGroup[] = [
  {
    id: "planning",
    icon: "calendarRange",
    label: "Planning",
    items: [
      { label: "Agenda", href: "/dashboard/agenda", icon: "calendarDays", assetKey: "agenda" },
      { label: "Tournées", href: "/dashboard/tournees", icon: "route", assetKey: "tournees" },
      { label: "Rappels clients", href: "/dashboard/rappels", icon: "bellRing", assetKey: "reminders" },
    ],
  },
  {
    id: "clientele",
    icon: "usersRound",
    label: "Clientèle",
    items: [
      { label: "Clients & animaux", href: "/dashboard/clients", icon: "users", assetKey: "clients" },
      { label: "Carte clients", href: "/dashboard/carte", icon: "mapPinned", assetKey: "map" },
    ],
  },
  {
    id: "gestion",
    icon: "briefcaseBusiness",
    label: "Gestion",
    items: [
      { label: "Prestations", href: "/dashboard/prestations", icon: "briefcase", assetKey: "services" },
      { label: "Documents", href: "/dashboard/documents", icon: "fileText", assetKey: "documents" },
    ],
  },
  {
    id: "pilotage",
    icon: "chartTrend",
    label: "Pilotage",
    items: [
      { label: "Statistiques", href: "/dashboard/statistiques", icon: "chartColumn", assetKey: "stats", requiresFinances: true },
    ],
  },
];

/** Vrai pour la page affichée, et pour elle seule. */
export function isEntryActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
