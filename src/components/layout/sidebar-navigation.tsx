"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BellRing,
  Briefcase,
  CalendarDays,
  ChartColumn,
  FileText,
  LayoutDashboard,
  MapPinned,
  Route,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { hasModule } from "@/lib/modules";
import {
  dashboardEntry,
  isEntryActive,
  navigationGroups,
  type NavigationEntry,
  type NavigationIconName,
} from "@/data/navigation";

const icons: Record<NavigationIconName, LucideIcon> = {
  layoutDashboard: LayoutDashboard,
  calendarDays: CalendarDays,
  route: Route,
  bellRing: BellRing,
  users: Users,
  mapPinned: MapPinned,
  briefcase: Briefcase,
  fileText: FileText,
  chartColumn: ChartColumn,
};

type SidebarNavigationProps = {
  pathname: string;
  showStatistics: boolean;
  onNavigate: () => void;
  /** Tiroir mobile : la barre y fait toujours sa pleine largeur, donc les
      libellés s'affichent même si le repli est actif sur grand écran. */
  forceLabels?: boolean;
};

/**
 * Corps de la navigation : « Tableau de bord », puis tous les liens, rangés
 * sous des titres qui ne se cliquent pas. Rien à déplier : ce qui existe se
 * voit.
 *
 * Quand la barre est réduite sans être survolée, les titres laissent la place
 * à un filet : une colonne d'icônes n'a pas de place pour eux. Le nom de
 * chaque page reste accessible en infobulle et par aria-label, jamais coupé à
 * moitié.
 *
 * `min-h-0` : la liste est la seule partie de la barre qui défile. Sur un
 * écran bas, elle cède de la hauteur et le bloc du bas (réglages, compte)
 * reste en place.
 */
export function SidebarNavigation({ pathname, showStatistics, onNavigate, forceLabels = false }: SidebarNavigationProps) {
  const { showLabels: contextLabels } = useSidebar();
  const { theme } = useDashboardTheme();
  const showLabels = contextLabels || forceLabels;

  const modules = useCurrentUser()?.modules ?? [];
  const groups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => (!item.requiresFinances || showStatistics) && (!item.module || hasModule(modules, item.module))) }))
    .filter((group) => group.items.length > 0);

  const link = (entry: NavigationEntry) => (
    <SidebarLink
      key={entry.href}
      label={entry.label}
      href={entry.href}
      icon={icons[entry.icon]}
      customAsset={theme.navigationAssets[entry.assetKey]}
      active={isEntryActive(pathname, entry.href)}
      showLabel={showLabels}
      onNavigate={onNavigate}
    />
  );

  return (
    <nav aria-label="Navigation principale" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
      {link(dashboardEntry)}

      {groups.map((group) => (
        <div
          key={group.id}
          role="group"
          aria-labelledby={showLabels ? `sidebar-group-${group.id}` : undefined}
          aria-label={showLabels ? undefined : group.label}
          className={showLabels ? "pt-3 short:pt-1.5" : "mt-1 border-t border-[var(--theme-sidebar-border)] pt-1"}
        >
          {showLabels ? (
            <p id={`sidebar-group-${group.id}`} className="px-3 pb-1 text-[11px] font-black uppercase tracking-[0.12em] text-[var(--theme-sidebar-text)]">
              {group.label}
            </p>
          ) : null}
          <div className="space-y-0.5">{group.items.map(link)}</div>
        </div>
      ))}
    </nav>
  );
}

/**
 * Un lien de la barre : 44 px de haut, son icône, la page courante marquée.
 * Sert à la liste comme au bloc du bas (Paramètres, Administration).
 */
export function SidebarLink({ label, href, icon: EntryIcon, customAsset, active, showLabel, onNavigate }: {
  label: string;
  href: string;
  icon: LucideIcon;
  /** Image choisie par le cabinet à la place de l'icône (Personnalisation). */
  customAsset?: string | null;
  active: boolean;
  showLabel: boolean;
  onNavigate: () => void;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      title={showLabel ? undefined : label}
      aria-label={showLabel ? undefined : label}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-[14px] font-bold transition ${showLabel ? "gap-3 px-3" : "justify-center px-0"} ${
        active
          ? "bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-text)]"
          : "text-[var(--theme-sidebar-text)] hover:bg-[var(--theme-sidebar-hover)] hover:text-[var(--theme-sidebar-text-strong)]"
      }`}
    >
      {customAsset ? (
        <Image src={customAsset} alt="" width={20} height={20} unoptimized className="h-5 w-5 shrink-0 rounded object-cover" />
      ) : (
        <EntryIcon aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
      )}
      {/* Libellé retiré du rendu, pas masqué par une largeur nulle : pendant
          le repli, aucun texte ne peut apparaître tronqué. */}
      {showLabel ? <span className="truncate text-sm">{label}</span> : null}
    </Link>
  );
}
