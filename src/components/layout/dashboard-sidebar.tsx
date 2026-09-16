"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { OPEN_MENU_EVENT } from "@/components/layout/mobile-bottom-nav";
import { ChevronRight, LogOut, PanelLeftClose, PanelLeftOpen, Settings, Shield, X } from "lucide-react";
import { SidebarNavigation } from "@/components/layout/sidebar-navigation";
import { useSidebar } from "@/components/layout/sidebar-provider";
import { logout } from "@/lib/auth/actions";
import { initialsFor } from "@/lib/format";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  PRACTITIONER: "Praticien",
  SECRETARY: "Secrétariat",
};

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ showAdmin = false, showStatistics = true }: { showAdmin?: boolean; showStatistics?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Ouverture demandée par la barre de navigation du bas (composant frère,
  // monté par le layout) — voir MobileBottomNav.
  useEffect(() => {
    function open() { setMobileOpen(true); }
    window.addEventListener(OPEN_MENU_EVENT, open);
    return () => window.removeEventListener(OPEN_MENU_EVENT, open);
  }, []);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { collapsed, toggleCollapsed } = useSidebar();
  const user = useCurrentUser();

  // Ferme le popover profil au clic en dehors — même logique que
  // AddressAutocomplete (src/components/ui/address-autocomplete.tsx).
  useEffect(() => {
    if (!profileOpen) return;
    function handlePointerDown(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [profileOpen]);

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
        // Largeur pilotée par la même variable que le décalage du contenu :
        // les deux ne peuvent pas se désynchroniser, donc pas de bande vide
        // ni de recouvrement pendant l'animation. Sur mobile la barre reste
        // un tiroir de 260 px, le repli n'y a pas de sens.
        className="dashboard-sidebar fixed inset-y-0 left-0 z-[60] flex w-[260px] flex-col border-r border-[var(--theme-sidebar-border)] px-3 py-6 text-[var(--theme-sidebar-text)] shadow-[16px_0_45px_rgb(var(--theme-shadow-rgb)/0.2)] transition-[transform,width] duration-200 ease-out md:z-40 md:w-[var(--sidebar-width)] md:shadow-none"
        style={{ backgroundColor: "var(--theme-sidebar)" }}
      >
        <div className={`mb-6 flex min-h-11 items-center gap-2 ${collapsed ? "flex-col" : "justify-between px-1"}`}>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-label="1002 Pattes — Tableau de bord" className="min-w-0">
            <AnimeoLogo size={collapsed ? "mark" : "sidebar"} tone="light" priority />
          </Link>

          {/* Repli : masqué sous md, où la navigation passe par le tiroir. */}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Déployer le menu" : "Réduire le menu"}
            title={collapsed ? "Déployer le menu" : "Réduire le menu"}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--theme-sidebar-text-strong)] transition hover:bg-[var(--theme-sidebar-hover)] md:flex"
          >
            {collapsed ? <PanelLeftOpen aria-hidden="true" className="h-5 w-5" /> : <PanelLeftClose aria-hidden="true" className="h-5 w-5" />}
          </button>

          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="dashboard-sidebar-close flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--theme-sidebar-hover)] text-[var(--theme-sidebar-text-strong)]">
            <X aria-hidden="true" className="h-5 w-5" />
          </button>
        </div>

        <SidebarNavigation
          pathname={pathname}
          showStatistics={showStatistics}
          collapsed={collapsed}
          onNavigate={() => setMobileOpen(false)}
        />

        {user ? (
          // relative + le popover en absolute/bottom-full : le sous-menu
          // flotte par-dessus le reste de la sidebar au lieu de le pousser
          // (la sidebar est une colonne flex de hauteur fixe — un sous-menu
          // dans le flux normal redimensionnait toute la navigation
          // au-dessus à chaque ouverture/fermeture).
          <div ref={profileRef} className="relative mt-3 shrink-0 border-t border-[var(--theme-sidebar-border)] pt-3">
            <button
              type="button"
              onClick={() => setProfileOpen((current) => !current)}
              aria-expanded={profileOpen}
              aria-label={collapsed ? `${user.firstName} — compte et réglages` : undefined}
              title={collapsed ? `${user.firstName} — compte et réglages` : undefined}
              className={`flex w-full items-center rounded-[14px] py-2.5 text-left transition hover:bg-[var(--theme-sidebar-hover)] ${collapsed ? "justify-center px-0" : "gap-3 px-3"}`}
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--theme-sidebar-hover)] text-sm font-black text-[var(--theme-sidebar-text-strong)]">{initialsFor(user.firstName, user.lastName)}</span>
              {collapsed ? null : (
                <>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-[var(--theme-sidebar-text-strong)]">{user.firstName}</span>
                    <span className="block truncate text-xs text-[var(--theme-sidebar-text)]">{roleLabels[user.role] ?? user.role}</span>
                  </span>
                  <ChevronRight aria-hidden="true" className={`h-4 w-4 shrink-0 text-[var(--theme-sidebar-text)] transition-transform ${profileOpen ? "-rotate-90" : ""}`} />
                </>
              )}
            </button>

            {profileOpen ? (
              <div className="absolute bottom-full left-0 z-20 mb-2 w-56 max-w-[calc(100vw-2rem)] space-y-0.5 rounded-2xl border border-animeo-border bg-white p-1.5 shadow-[0_16px_40px_rgb(var(--theme-shadow-rgb)/0.35)]">
                <Link
                  href="/dashboard/parametres"
                  onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  aria-current={isActive(pathname, "/dashboard/parametres") ? "page" : undefined}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg"
                >
                  <Settings aria-hidden="true" className="h-4 w-4" />
                  Paramètres
                </Link>
                {showAdmin ? (
                  <Link
                    href="/dashboard/admin"
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                    aria-current={isActive(pathname, "/dashboard/admin") ? "page" : undefined}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg"
                  >
                    <Shield aria-hidden="true" className="h-4 w-4" />
                    Administration
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-danger transition hover:bg-animeo-danger-soft"
                >
                  <LogOut aria-hidden="true" className="h-4 w-4" />
                  Se déconnecter
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
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

