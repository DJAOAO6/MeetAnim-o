"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { AnimeoLogo } from "@/components/brand/animeo-logo";
import { Icon, type IconName } from "@/components/ui/icon";

type NavigationItem = {
  label: string;
  href: string;
  icon: IconName;
};

const navigation: NavigationItem[] = [
  { label: "Tableau de bord", href: "/dashboard", icon: "dashboard" },
  { label: "Agenda", href: "/dashboard/agenda", icon: "agenda" },
  { label: "Clients & animaux", href: "/dashboard/clients", icon: "clients" },
  { label: "Tournées", href: "/dashboard/tournees", icon: "tournees" },
  { label: "Carte clients", href: "/dashboard/carte", icon: "map" },
  { label: "Rappels clients", href: "/dashboard/rappels", icon: "bell" },
  { label: "Prestations", href: "/dashboard/prestations", icon: "services" },
  { label: "Paramètres", href: "/dashboard/parametres", icon: "settings" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") {
    return pathname === href;
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <header className="dashboard-mobile-header fixed inset-x-0 top-0 z-40 flex h-16 items-center justify-between bg-animeo-dark px-4 text-white shadow-sm">
        <Link href="/dashboard" aria-label="Animéo — Tableau de bord">
          <AnimeoLogo size="mobile" tone="light" priority />
        </Link>
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Ouvrir le menu"
          aria-expanded={mobileOpen}
          className="dashboard-mobile-menu-button flex h-11 w-11 items-center justify-center rounded-[14px] bg-white/10 text-2xl font-bold"
          style={{
            position: "fixed",
            right: 16,
            top: 10,
            zIndex: 70,
            display: "flex",
            background: "rgba(255,255,255,0.12)",
            color: "#ffffff",
          }}
        >
          ☰
        </button>
      </header>

      {mobileOpen ? <button type="button" aria-label="Fermer le menu" onClick={() => setMobileOpen(false)} className="fixed inset-0 z-50 bg-animeo-dark/45 backdrop-blur-[2px] md:hidden" /> : null}

      <aside
        data-open={mobileOpen}
        className="dashboard-sidebar fixed inset-y-0 left-0 z-[60] flex w-64 flex-col bg-animeo-dark px-5 py-7 text-white shadow-[16px_0_45px_rgba(12,39,47,0.2)] transition-transform duration-200 md:z-40 md:shadow-none"
      >
        <div className="mb-7 flex min-h-11 items-center justify-between px-3" style={{ marginTop: 20 }}>
          <Link href="/dashboard" onClick={() => setMobileOpen(false)} aria-label="Animéo — Tableau de bord">
            <AnimeoLogo size="sidebar" tone="light" priority />
          </Link>
          <button type="button" onClick={() => setMobileOpen(false)} aria-label="Fermer le menu" className="dashboard-sidebar-close flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-2xl">×</button>
        </div>

        <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto">
          {navigation.map((item) => {
            const active = isActive(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                aria-current={active ? "page" : undefined}
                onClick={() => setMobileOpen(false)}
                className={`group flex min-h-12 items-center gap-3.5 rounded-[14px] px-4 font-bold transition ${
                  active
                    ? "bg-animeo text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)]"
                    : "text-white/70 hover:bg-white/10 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5 shrink-0" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </aside>
    </>
  );
}
