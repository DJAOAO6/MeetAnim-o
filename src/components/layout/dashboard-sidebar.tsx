"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { OPEN_MENU_EVENT } from "@/components/layout/mobile-bottom-nav";
import { LogOut, PanelLeftClose, PanelLeftOpen, Settings, Shield, ShieldCheck, X } from "lucide-react";
import { SidebarLink, SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { IconButton } from "@/components/ui/icon-button";
import { isEntryActive } from "@/data/navigation";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { logout } from "@/lib/auth/actions";
import { MobileSearchButton } from "@/components/search/header-search";
import { initialsFor } from "@/lib/format";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  PRACTITIONER: "Praticien",
  SECRETARY: "Secrétariat",
};

export function DashboardSidebar({ showAdmin = false, showStatistics = true, showPlatform = false }: { showAdmin?: boolean; showStatistics?: boolean; showPlatform?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ouverture demandée par la barre de navigation du bas (composant frère,
  // monté par le layout) — voir MobileBottomNav.
  useEffect(() => {
    function open() { setMobileOpen(true); }
    window.addEventListener(OPEN_MENU_EVENT, open);
    return () => window.removeEventListener(OPEN_MENU_EVENT, open);
  }, []);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { collapsed, hoverExpanded, showLabels: contextLabels, toggleCollapsed, handleSidebarHover } = useSidebar();
  // Sous 768 px la barre est un tiroir de 260 px : le repli n'y a pas cours,
  // et une colonne d'icônes seules dans un tiroir large serait absurde.
  const showLabels = contextLabels || mobileOpen;
  const user = useCurrentUser();

  return (
    <>
      <header className="dashboard-mobile-header fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between border-b border-[var(--theme-sidebar-border)] px-4 text-[var(--theme-sidebar-text-strong)] shadow-sm" style={{ backgroundColor: "var(--theme-sidebar)" }}>
        <Link href="/dashboard" aria-label="1002 Pattes — Tableau de bord">
          <AnimeoLogo size="mobile" tone="light" priority />
        </Link>
        {/* Cloche + bouton menu regroupés dans un même conteneur fixe, pour
            ne pas empiler une seconde barre d'en-tête sous 768px : la cloche
            de HeaderActions est masquée sur mobile et vit ici à la place
            (PROMPT-NOTIFICATIONS.md §B2 bis, option 1). */}
        {/* Cloche placée après le bouton menu (dernier élément du groupe) :
            le panneau s'ancre en `right-0` sur son propre conteneur, donc la
            garder au bord droit évite qu'il ne déborde à gauche du viewport. */}
        <div className="flex items-center gap-2" style={{ position: "fixed", right: 16, top: 10, zIndex: 70 }}>
          {/* La recherche de l'en-tête, en plein écran (masquée avec lui sous 768px). */}
          <MobileSearchButton className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-[var(--theme-sidebar-hover)] text-[var(--theme-sidebar-text-strong)]" />
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            aria-expanded={mobileOpen}
            className="dashboard-mobile-menu-button flex h-11 w-11 items-center justify-center rounded-[14px] text-2xl font-bold"
            style={{ background: "var(--theme-sidebar-hover)", color: "var(--theme-sidebar-text-strong)" }}
          >
            ☰
          </button>
          <NotificationsBell variant="onDark" />
        </div>
      </header>

      {mobileOpen ? <button type="button" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-50 bg-animeo-dark/45 backdrop-blur-[2px] md:hidden" /> : null}

      <aside
        data-open={mobileOpen}
        data-collapsed={collapsed}
        data-hover-expanded={hoverExpanded}
        onMouseEnter={() => handleSidebarHover(true)}
        onMouseLeave={() => handleSidebarHover(false)}
        // Largeur pilotée par la même variable que le décalage du contenu :
        // les deux ne peuvent pas se désynchroniser, donc pas de bande vide
        // ni de recouvrement pendant l'animation. Sur mobile la barre reste
        // un tiroir de 260 px, le repli n'y a pas de sens.
        // Survol d'une barre réduite : elle reprend sa pleine largeur par
        // -dessus le contenu (ombre portée, z-index au-dessus), sans toucher
        // à --sidebar-width — le contenu reste donc parfaitement immobile.
        className={`dashboard-sidebar fixed inset-y-0 left-0 z-[60] flex w-[260px] flex-col border-r border-[var(--theme-sidebar-border)] px-3 py-6 short:py-3 text-[var(--theme-sidebar-text)] shadow-[16px_0_45px_rgb(var(--theme-shadow-rgb)/0.2)] transition-[transform,width] duration-200 ease-out md:z-40 ${
          // Les deux ombres se décident dans la même branche : laisser un
          // md:shadow-none dans la partie fixe rendait l'ordre des deux
          // utilitaires dépendant de l'ordre de génération de Tailwind, et
          // c'est « pas d'ombre » qui l'emportait — le flyout se posait alors
          // sur le contenu sans aucune séparation visible.
          hoverExpanded
            ? "md:w-[260px] md:shadow-[16px_0_45px_rgb(var(--theme-shadow-rgb)/0.18)]"
            : "md:w-[var(--sidebar-width)] md:shadow-none"
        }`}
        style={{ backgroundColor: "var(--theme-sidebar)" }}
      >
        <div className={`mb-6 flex min-h-11 items-center gap-2 short:mb-3 ${showLabels ? "justify-between px-1" : "flex-col"}`}>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-label="1002 Pattes — Tableau de bord" className="min-w-0">
            <AnimeoLogo size={showLabels ? "sidebar" : "mark"} tone="light" priority />
          </Link>

          {/* Repli : masqué sous md, où la navigation passe par le tiroir. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
            title={collapsed ? "Déployer le menu" : "Réduire le menu"}
            aria-pressed={!collapsed}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--theme-sidebar-text-strong)] transition hover:bg-[var(--theme-sidebar-hover)] md:flex"
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" /> : <PanelLeftClose aria-hidden="true" className="h-5 w-5" />}
          </button>

          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="dashboard-sidebar-close flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-sidebar-hover)] text-[var(--theme-sidebar-text-strong)]">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <SidebarNavigation pathname={pathname} showStatistics={showStatistics} onNavigate={() => setMobileOpen(false)} forceLabels={mobileOpen} />

        {/* Bloc du bas, toujours visible : les réglages et le compte ne sont
            plus rangés derrière un sous-menu. Il ne rétrécit pas — c'est la
            liste au-dessus qui défile quand l'écran est bas. */}
        <div className="mt-3 shrink-0 space-y-0.5 border-t border-[var(--theme-sidebar-border)] pt-3 short:mt-2 short:pt-2">
          <SidebarLink label="Paramètres" href="/dashboard/parametres" icon={Settings} active={isEntryActive(pathname, "/dashboard/parametres")} showLabel={showLabels} onNavigate={() => setMobileOpen(false)} />
          {showAdmin ? (
            <SidebarLink label="Administration" href="/dashboard/admin" icon={Shield} active={isEntryActive(pathname, "/dashboard/admin")} showLabel={showLabels} onNavigate={() => setMobileOpen(false)} />
          ) : null}
          {showPlatform ? (
            <SidebarLink label="Super-administration" href="/plateforme" icon={ShieldCheck} active={false} showLabel={showLabels} onNavigate={() => setMobileOpen(false)} />
          ) : null}

          {user ? (
            <div className={`flex items-center pt-2 short:pt-1 ${showLabels ? "gap-3 pl-3" : "flex-col gap-2"}`}>
              <span
                title={showLabels ? undefined : `${user.firstName} — ${roleLabels[user.role] ?? user.role}`}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--theme-sidebar-hover)] text-sm font-black text-[var(--theme-sidebar-text-strong)]"
              >
                {initialsFor(user.firstName, user.lastName)}
              </span>
              {showLabels ? (
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-[var(--theme-sidebar-text-strong)]">{user.firstName}</span>
                  <span className="block truncate text-xs text-[var(--theme-sidebar-text)]">{roleLabels[user.role] ?? user.role}</span>
                </span>
              ) : null}
              {/* Infobulle vers la droite quand la barre est réduite : au-dessus,
                  le bord gauche de l'écran la couperait. */}
              <IconButton label="Se déconnecter" onClick={() => setLogoutConfirmOpen(true)} tooltipSide={showLabels ? "top" : "right"} tooltipAlign="end">
                <LogOut aria-hidden="true" className="h-5 w-5" />
              </IconButton>
            </div>
          ) : null}
        </div>
      </aside>

      {logoutConfirmOpen ? (
        <ConfirmModal
          title="Se déconnecter ?"
          message="Vous devrez vous reconnecter avec votre email et votre mot de passe pour accéder de nouveau à votre espace professionnel."
          confirmLabel="Se déconnecter"
          onConfirm={() => { void logout(); }}
          onClose={() => setLogoutConfirmOpen(false)}
        />
      ) : null}
    </>
  );
}

