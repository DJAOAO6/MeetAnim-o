"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Icon, type IconName } from "@/components/ui/icon";
import { logout } from "@/lib/auth/actions";
import { initialsFor } from "@/lib/format";
import type { NavigationAssetKey } from "@/data/dashboard-theme";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  PRACTITIONER: "Praticien",
  SECRETARY: "Secrétariat",
};

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
  assetKey: NavigationAssetKey;
};

const navigation: NavigationItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: "dashboard", assetKey: "dashboard" },
  { label: "Agenda", href: "/dashboard/agenda", icon: "agenda", assetKey: "agenda" },
  { label: "Clients & animaux", href: "/dashboard/clients", icon: "clients", assetKey: "clients" },
  { label: "Tournées", href: "/dashboard/tournees", icon: "tournees", assetKey: "tournees" },
  { label: "Carte clients", href: "/dashboard/carte", icon: "map", assetKey: "map" },
  { label: "Rappels clients", href: "/dashboard/rappels", icon: "bell", assetKey: "reminders" },
  { label: "Prestations", href: "/dashboard/prestations", icon: "services", assetKey: "services" },
  { label: "Documents", href: "/dashboard/documents", icon: "document", assetKey: "documents" },
];

const statisticsItem: NavigationItem = { label: "Statistiques", href: "/dashboard/statistiques", icon: "stats", assetKey: "stats" };

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar({ showAdmin = false, showStatistics = true }: { showAdmin?: boolean; showStatistics?: boolean }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const { theme } = useDashboardTheme();
  const user = useCurrentUser();
  const items = showStatistics ? [...navigation, statisticsItem] : navigation;

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
        className="dashboard-sidebar fixed inset-y-0 left-0 z-[60] flex w-64 flex-col border-r border-[var(--theme-sidebar-border)] px-5 py-7 text-[var(--theme-sidebar-text)] shadow-[16px_0_45px_rgb(var(--theme-shadow-rgb)/0.2)] transition-transform duration-200 md:z-40 md:shadow-none"
        style={{ backgroundColor: "var(--theme-sidebar)" }}
      >
        <div className="mb-8 flex min-h-11 items-center justify-between px-2" style={{ marginTop: 12 }}>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-label="1002 Pattes — Tableau de bord">
            <AnimeoLogo size="sidebar" tone="light" priority />
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="dashboard-sidebar-close flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--theme-sidebar-hover)] text-2xl text-[var(--theme-sidebar-text-strong)]">×</button>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto">
          {items.map((item) => {
            const active = isActive(pathname, item.href);
            const customAsset = theme.navigationAssets[item.assetKey];

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`group flex min-h-12 items-center gap-3.5 rounded-[14px] px-4 font-bold transition ${
                  active
                    ? "bg-[var(--theme-sidebar-active-bg)] text-[var(--theme-sidebar-active-text)] shadow-[0_6px_16px_color-mix(in_srgb,var(--theme-brand)_14%,transparent)]"
                    : "text-[var(--theme-sidebar-text)] hover:bg-[var(--theme-sidebar-hover)] hover:text-[var(--theme-sidebar-text-strong)]"
                }`}
              >
                {customAsset ? (
                  <Image src={customAsset} alt="" width={20} height={20} unoptimized className="h-5 w-5 shrink-0 rounded object-cover" />
                ) : (
                  <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                )}
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

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
              className="flex w-full items-center gap-3 rounded-[14px] px-3 py-2.5 text-left transition hover:bg-[var(--theme-sidebar-hover)]"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] bg-[var(--theme-sidebar-hover)] text-sm font-black text-[var(--theme-sidebar-text-strong)]">{initialsFor(user.firstName, user.lastName)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-[var(--theme-sidebar-text-strong)]">{user.firstName}</span>
                <span className="block truncate text-xs text-[var(--theme-sidebar-text)]">{roleLabels[user.role] ?? user.role}</span>
              </span>
              <Icon name="arrow" className={`h-4 w-4 shrink-0 text-[var(--theme-sidebar-text)] transition-transform ${profileOpen ? "-rotate-90" : "rotate-90"}`} />
            </button>

            {profileOpen ? (
              <div className="absolute inset-x-0 bottom-full z-20 mb-2 space-y-0.5 rounded-2xl border border-animeo-border bg-white p-1.5 shadow-[0_16px_40px_rgb(var(--theme-shadow-rgb)/0.35)]">
                <Link
                  href="/dashboard/parametres"
                  onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                  aria-current={isActive(pathname, "/dashboard/parametres") ? "page" : undefined}
                  className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg"
                >
                  <Icon name="settings" className="h-4 w-4" />
                  Paramètres
                </Link>
                {showAdmin ? (
                  <Link
                    href="/dashboard/admin"
                    onClick={() => { setProfileOpen(false); setMobileOpen(false); }}
                    aria-current={isActive(pathname, "/dashboard/admin") ? "page" : undefined}
                    className="flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg"
                  >
                    <Icon name="shield" className="h-4 w-4" />
                    Administration
                  </Link>
                ) : null}
                <button
                  type="button"
                  onClick={() => setLogoutConfirmOpen(true)}
                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-bold text-animeo-danger transition hover:bg-animeo-danger-soft"
                >
                  <LogoutIcon />
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

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
