import type { NavigationAssetKey } from "@/data/dashboard-theme";
import type { ModuleKey } from "@/lib/modules";

/**
 * Plan de navigation du tableau de bord : tous les liens visibles, rangés
 * sous trois titres par métier (PLAN-BOUTONS, 3.10). Les titres ne se
 * cliquent pas — des catégories à déplier cachaient la moitié du logiciel
 * derrière un geste de plus. « Tableau de bord » reste hors catégorie, c'est
 * le point de départ.
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
  /** Module dont la page dépend (src/lib/modules.ts) ; absent : socle. */
  module?: ModuleKey;
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

export type NavigationGroup = {
  id: string;
  /** Titre de la section, non cliquable. */
  label: string;
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
    label: "Planning",
    items: [
      { label: "Agenda", href: "/dashboard/agenda", icon: "calendarDays", assetKey: "agenda" },
      { label: "Tournées", href: "/dashboard/tournees", icon: "route", assetKey: "tournees", module: "TOURS" },
      { label: "Rappels clients", href: "/dashboard/rappels", icon: "bellRing", assetKey: "reminders", module: "REMINDERS" },
    ],
  },
  {
    id: "clientele",
    label: "Clientèle",
    items: [
      { label: "Clients & animaux", href: "/dashboard/clients", icon: "users", assetKey: "clients" },
      { label: "Carte clients", href: "/dashboard/carte", icon: "mapPinned", assetKey: "map", module: "TOURS" },
    ],
  },
  {
    id: "gestion",
    label: "Gestion",
    items: [
      { label: "Prestations", href: "/dashboard/prestations", icon: "briefcase", assetKey: "services" },
      { label: "Documents", href: "/dashboard/documents", icon: "fileText", assetKey: "documents", module: "DOCUMENTS" },
      { label: "Statistiques", href: "/dashboard/statistiques", icon: "chartColumn", assetKey: "stats", requiresFinances: true, module: "STATISTICS" },
    ],
  },
];

/** Vrai pour la page affichée, et pour elle seule. */
export function isEntryActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  return pathname === href || pathname.startsWith(`${href}/`);
}
