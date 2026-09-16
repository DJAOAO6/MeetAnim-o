"use client";

import Image from "next/image";
import Link from "next/link";
import {
  BellRing,
  Briefcase,
  BriefcaseBusiness,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  ChartNoAxesCombined,
  ChevronDown,
  FileText,
  LayoutDashboard,
  MapPinned,
  Route,
  Users,
  UsersRound,
  type LucideIcon,
} from "lucide-react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { useSidebar } from "@/components/layout/sidebar-provider";
import {
  dashboardEntry,
  isEntryActive,
  navigationGroups,
  type GroupIconName,
  type NavigationEntry,
  type NavigationGroup,
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

const groupIcons: Record<GroupIconName, LucideIcon> = {
  calendarRange: CalendarRange,
  usersRound: UsersRound,
  briefcaseBusiness: BriefcaseBusiness,
  chartTrend: ChartNoAxesCombined,
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
 * Corps de la navigation : une entrée isolée (Tableau de bord) puis des
 * catégories repliables, une seule ouverte à la fois.
 *
 * Quand la barre est réduite sans être survolée, les catégories disparaissent
 * au profit d'une simple colonne d'icônes : un accordéon sans libellé ne veut
 * plus rien dire. Le nom de chaque page reste accessible en infobulle et par
 * aria-label, jamais coupé à moitié.
 */
export function SidebarNavigation({ pathname, showStatistics, onNavigate, forceLabels = false }: SidebarNavigationProps) {
  const { showLabels: contextLabels, openGroup, groupChosen, setOpenGroup, handleGroupHover } = useSidebar();
  const showLabels = contextLabels || forceLabels;

  const groups = navigationGroups
    .map((group) => ({ ...group, items: group.items.filter((item) => !item.requiresFinances || showStatistics) }))
    .filter((group) => group.items.length > 0);

  if (!showLabels) {
    return (
      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
        <SidebarLink entry={dashboardEntry} pathname={pathname} showLabel={false} onNavigate={onNavigate} />
        {groups.map((group) => (
          <div key={group.id} className="space-y-1 border-t border-[var(--theme-sidebar-border)] pt-1">
            {group.items.map((item) => (
              <SidebarLink key={item.href} entry={item} pathname={pathname} showLabel={false} onNavigate={onNavigate} />
            ))}
          </div>
        ))}
      </nav>
    );
  }

  return (
    <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto overflow-x-hidden">
      <SidebarLink entry={dashboardEntry} pathname={pathname} showLabel onNavigate={onNavigate} />

      {groups.map((group) => {
        // Tant que rien n'a été ouvert à la main, c'est la catégorie de la
        // page affichée qui est déployée : l'entrée active n'est jamais cachée
        // au premier regard. Ensuite, le choix de l'utilisateur seul décide.
        const open = groupChosen ? openGroup === group.id : group.items.some((item) => isEntryActive(pathname, item.href));
        return (
          <NavigationGroupRow
            key={group.id}
            group={group}
            pathname={pathname}
            open={open}
            // Fermeture décidée à partir de ce qui est affiché, pas de l'état
            // interne : la catégorie de la page courante est ouverte sans
            // avoir été choisie, et doit pouvoir se refermer du premier clic.
            onToggle={() => setOpenGroup(open ? null : group.id)}
            onHover={() => handleGroupHover(group.id)}
            onNavigate={onNavigate}
          />
        );
      })}
    </nav>
  );
}

function NavigationGroupRow({ group, pathname, open, onToggle, onHover, onNavigate }: {
  group: NavigationGroup;
  pathname: string;
  open: boolean;
  onToggle: () => void;
  onHover: () => void;
  onNavigate: () => void;
}) {
  const GroupIcon = groupIcons[group.icon];
  const hasActive = group.items.some((item) => isEntryActive(pathname, item.href));

  return (
    <div className="pt-1" onMouseEnter={onHover}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-controls={`sidebar-group-${group.id}`}
        className={`flex min-h-11 w-full items-center gap-3 rounded-[14px] px-3 text-left text-[11px] font-black uppercase tracking-[0.1em] transition ${
          hasActive ? "text-[var(--theme-sidebar-text-strong)]" : "text-[var(--theme-sidebar-text)]"
        } hover:bg-[var(--theme-sidebar-hover)] hover:text-[var(--theme-sidebar-text-strong)]`}
      >
        <GroupIcon aria-hidden="true" className="h-[18px] w-[18px] shrink-0" strokeWidth={2} />
        <span className="flex-1 truncate">{group.label}</span>
        <ChevronDown aria-hidden="true" className={`h-4 w-4 shrink-0 transition-transform duration-200 ${open ? "" : "-rotate-90"}`} />
      </button>

      {/* grid-template-rows animé : la hauteur du contenu n'a pas besoin
          d'être connue à l'avance, contrairement à une animation sur
          max-height qui saccade ou tronque. */}
      <div
        id={`sidebar-group-${group.id}`}
        className={`grid transition-[grid-template-rows] duration-200 ease-out ${open ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}
      >
        {/* visibility, et pas seulement une hauteur nulle : le contenu d'une
            catégorie fermée est clippé visuellement mais resterait tabulable
            et lu par les lecteurs d'écran. */}
        <div className={`overflow-hidden ${open ? "visible" : "invisible"}`}>
          <div className="space-y-0.5 py-1 pl-3">
            {group.items.map((item) => (
              <SidebarLink key={item.href} entry={item} pathname={pathname} showLabel onNavigate={onNavigate} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function SidebarLink({ entry, pathname, showLabel, onNavigate }: { entry: NavigationEntry; pathname: string; showLabel: boolean; onNavigate: () => void }) {
  const { theme } = useDashboardTheme();
  const active = isEntryActive(pathname, entry.href);
  const customAsset = theme.navigationAssets[entry.assetKey];
  const EntryIcon = icons[entry.icon];

  return (
    <Link
      href={entry.href}
      onClick={onNavigate}
      title={showLabel ? undefined : entry.label}
      aria-label={showLabel ? undefined : entry.label}
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
      {showLabel ? <span className="truncate text-sm">{entry.label}</span> : null}
    </Link>
  );
}
