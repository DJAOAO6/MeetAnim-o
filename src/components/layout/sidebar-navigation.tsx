"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BellRing,
  Briefcase,
  CalendarDays,
  ChartColumn,
  ChevronDown,
  FileText,
  LayoutDashboard,
  MapPinned,
  Route,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { useSidebar } from "@/components/layout/sidebar-provider";
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
  /** Barre réduite : icônes seules, libellés en infobulle. */
  collapsed: boolean;
  onNavigate: () => void;
};

/**
 * Corps de la navigation : une entrée isolée (Tableau de bord) puis des
 * catégories repliables.
 *
 * Repliée, la barre n'affiche que les icônes : les catégories disparaissent
 * au profit d'une simple liste, car un accordéon sans libellé ne veut plus
 * rien dire. Le nom de chaque page reste accessible en infobulle et par
 * aria-label, jamais coupé à moitié.
 */
export function SidebarNavigation({ pathname, showStatistics, collapsed, onNavigate }: SidebarNavigationProps) {
  const { openGroups, toggleGroup } = useSidebar();
  const groups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.requiresFinances || showStatistics) }))
    .filter((group) => group.items.length > 0);

  if (collapsed) {
    return (
      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
        <SidebarLink entry={dashboardEntry} pathname={pathname} collapsed onNavigate={onNavigate} />
        {groups.map((group) => (
          <div key={group.id} className="space-y-1 border-t border-[var(--theme-sidebar-border)] pt-1 first-of-type:border-0">
            {group.items.map((item) => (
              <SidebarLink key={item.href} entry={item} pathname={pathname} collapsed onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Navigation principale" className="flex-1 space-y-1.5 overflow-y-auto overflow-x-hidden">
      <SidebarLink entry={dashboardEntry} pathname={pathname} collapsed={false} onNavigate={onNavigate} />

      {groups.map((group) => {
        const hasActive = group.items.some((item) => isEntryActive(pathname, item.href));
        // La catégorie de la page courante reste ouverte, même si
        // l'utilisateur l'avait refermée : sinon l'élément actif serait
        // invisible et la barre paraîtrait ne mener nulle part.
        const open = openGroups.includes(group.id) || hasActive;

        return (
          <div key={group.id} className="pt-2">
            <button
              type="button"
              onClick={() => toggleGroup(group.id)}
              aria-expanded={open}
              aria-controls={`sidebar-group-${group.id}`}
              className="flex min-h-9 w-full items-center justify-between rounded-xl px-3 text-left text-[11px] font-black uppercase tracking-[0.12em] text-[var(--theme-sidebar-text)] transition hover:bg-[var(--theme-sidebar-hover)]"
            >
              {group.label}
              <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
            </button>

            {/* grid-template-rows animé : la hauteur du contenu n'a pas
                besoin d'être connue à l'avance, contrairement à une
                animation sur max-height qui saccade ou tronque. */}
            <div
              id={`sidebar-group-${group.id}`}
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
            >
              <div className="overflow-hidden">
                <div className="space-y-0.5 pt-1">
                  {group.items.map((item) => (
                    <SidebarLink key={item.href} entry={item} pathname={pathname} collapsed={false} onNavigate={onNavigate} />
                  ))}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

function SidebarLink({ entry, pathname, collapsed, onNavigate }: { entry: NavigationEntry; pathname: string; collapsed: boolean; onNavigate: () => void }) {
  const { theme } = useDashboardTheme();
  const active = isEntryActive(pathname, entry.href);
  const customAsset = theme.navigationAssets[entry.assetKey];
  const LucideIconComponent = icons[entry.icon];

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      title={collapsed ? entry.label : undefined}
      aria-label={collapsed ? entry.label : undefined}
      aria-current={active ? "page" : undefined}
      className={`flex min-h-11 items-center rounded-[14px] font-bold transition ${collapsed ? "justify-center px-0" : "gap-3 px-3"} ${
        active
          ? "bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-text)]"
          : "text-[var(--theme-sidebar-text)] hover:bg-[var(--theme-sidebar-hover)] hover:text-[var(--theme-sidebar-text-strong)]"
      }`}
    >
      {customAsset ? (
        <Image src={customAsset} alt="" width={20} height={20} unoptimized className="h-5 w-5 shrink-0 rounded object-cover" />
      ) : (
        <LucideIconComponent aria-hidden="true" className="h-5 w-5 shrink-0" strokeWidth={2} />
      )}
      {/* Le libellé n'est pas masqué par une largeur nulle mais retiré du
          rendu : pendant le repli, aucun texte ne peut apparaître tronqué. */}
      {collapsed ? null : <span className="truncate text-sm">{entry.label}</span>}
    </Link>
  );
}
