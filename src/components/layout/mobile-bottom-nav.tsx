"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Événement écouté par DashboardSidebar pour ouvrir son tiroir. La barre du
 * bas et le tiroir sont deux composants frères, montés par le layout : passer
 * par un événement évite de remonter l'état d'ouverture dans un contexte
 * partagé pour un seul bouton.
 */
export const OPEN_MENU_EVENT = "dashboard:open-menu";

type BottomNavItem = { label: string; href: string; icon: IconName };

/**
 * Les quatre destinations les plus utilisées au quotidien — le reste (carte,
 * rappels, prestations, documents, réglages) reste dans le tiroir, ouvert
 * par le cinquième bouton. Une barre à huit entrées serait illisible au
 * pouce, et la hiérarchie des usages est celle du métier : on consulte son
 * agenda et ses fiches clients bien plus souvent que ses prestations.
 */
const items: BottomNavItem[] = [
  { label: "Accueil", href: "/dashboard", icon: "dashboard" },
  { label: "Agenda", href: "/dashboard/agenda", icon: "agenda" },
  { label: "Clients", href: "/dashboard/clients", icon: "clients" },
  { label: "Tournées", href: "/dashboard/tournees", icon: "tournees" },
];

function isActive(pathname: string, href: string) {
  if (href === "/dashboard") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Navigation principale (mobile)"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-animeo-border bg-animeo-surface/95 backdrop-blur md:hidden"
      // La barre gestuelle des téléphones récents mange les derniers pixels :
      // sans ce dégagement, la rangée d'icônes tombe sous la zone tactile.
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="flex items-stretch">
        {items.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                // min-h-14 : la cible dépasse les 44 px recommandés sur toute
                // la largeur de la colonne, pas seulement sur l'icône.
                className={`flex min-h-14 flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-extrabold transition ${
                  active ? "text-animeo" : "text-animeo-muted"
                }`}
              >
                <Icon name={item.icon} className="h-5 w-5" />
                <span className="truncate">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event(OPEN_MENU_EVENT))}
            aria-label="Ouvrir le menu complet"
            className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 py-2 text-[11px] font-extrabold text-animeo-muted transition"
          >
            <span aria-hidden="true" className="text-lg leading-none">☰</span>
            <span>Menu</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
