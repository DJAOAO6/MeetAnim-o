"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-20 flex-col bg-animeo-dark px-3 py-5 text-white md:w-72 md:px-5 md:py-7">
      <Link
        href="/dashboard"
        className="mb-7 flex items-center justify-center md:justify-start md:px-3"
        aria-label="Animéo — Tableau de bord"
      >
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 md:hidden">
          <Icon name="paw" className="h-6 w-6 text-animeo" />
        </span>
        <span className="hidden text-3xl font-black tracking-tight md:inline">
          Anim<span className="text-animeo">éo</span>
        </span>
      </Link>

      <nav aria-label="Navigation principale" className="flex-1 space-y-1 overflow-y-auto">
        {navigation.map((item) => {
          const active = isActive(pathname, item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              aria-current={active ? "page" : undefined}
              className={`group flex min-h-12 items-center justify-center rounded-2xl px-3 font-bold transition md:justify-start md:gap-3.5 md:px-4 ${
                active
                  ? "bg-animeo text-white shadow-[0_8px_20px_rgba(79,175,159,0.22)]"
                  : "text-white/70 hover:bg-white/10 hover:text-white"
              }`}
            >
              <Icon name={item.icon} className="h-5 w-5 shrink-0" />
              <span className="hidden md:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-5 border-t border-white/10 pt-5">
        <div className="flex items-center justify-center md:justify-start md:gap-3 md:px-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft font-extrabold text-animeo-dark">
            PF
          </div>
          <div className="hidden min-w-0 md:block">
            <p className="truncate text-sm font-extrabold">Pauline Faucillon</p>
            <p className="truncate text-xs text-white/55">PF Ostéo Animale</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
