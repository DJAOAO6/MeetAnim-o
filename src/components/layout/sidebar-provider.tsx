"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

type SidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  openGroups: string[];
  toggleGroup: (id: string) => void;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

const COLLAPSED_KEY = "1002pattes.sidebar.collapsed";
const GROUPS_KEY = "1002pattes.sidebar.groups";

/**
 * État de la navigation latérale : repliée ou non, et catégories ouvertes.
 *
 * Conservé dans le navigateur plutôt qu'en base : c'est une préférence
 * d'affichage propre à l'écran utilisé, pas une donnée du cabinet. La même
 * personne peut vouloir la barre repliée sur son portable et déployée sur son
 * grand écran — un réglage enregistré côté compte lui imposerait le même
 * choix partout.
 *
 * La largeur est publiée en variable CSS sur <body> : la mise en page du
 * tableau de bord la lit pour son propre décalage, si bien que le contenu
 * récupère l'espace sans que chaque page ait à s'en préoccuper.
 */
function readStored<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    // Navigation privée, stockage refusé : valeurs par défaut.
    return fallback;
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  // Initialisation paresseuse plutôt qu'un effet : la préférence est connue
  // dès le premier rendu côté navigateur, sans second rendu ni bascule
  // visible de la barre. Le rendu serveur, lui, part toujours du défaut.
  const [collapsed, setCollapsed] = useState(() => readStored(COLLAPSED_KEY, false, (raw) => raw === "1"));
  const [openGroups, setOpenGroups] = useState<string[]>(() => readStored(GROUPS_KEY, [], (raw) => JSON.parse(raw) as string[]));

  useEffect(() => {
    document.body.style.setProperty("--sidebar-width", collapsed ? "76px" : "260px");
    document.body.dataset.sidebar = collapsed ? "collapsed" : "expanded";
    try { window.localStorage.setItem(COLLAPSED_KEY, collapsed ? "1" : "0"); } catch { /* stockage indisponible */ }
  }, [collapsed]);

  useEffect(() => {
    try { window.localStorage.setItem(GROUPS_KEY, JSON.stringify(openGroups)); } catch { /* stockage indisponible */ }
  }, [openGroups]);

  const toggleCollapsed = useCallback(() => {
    setCollapsed((current) => {
      // Les cartes (Leaflet) et les graphiques dimensionnés en pixels ne se
      // redessinent que sur un redimensionnement : la largeur utile vient de
      // changer, on le leur signale une fois l'animation terminée.
      window.setTimeout(() => window.dispatchEvent(new Event("resize")), 260);
      return !current;
    });
  }, []);

  const toggleGroup = useCallback((id: string) => {
    setOpenGroups((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }, []);

  return (
    <SidebarContext.Provider value={{ collapsed, toggleCollapsed, openGroups, toggleGroup }}>
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar doit être utilisé dans SidebarProvider.");
  return context;
}

/**
 * Catégories fermées par défaut, sauf celle de la page courante : on arrive
 * sur un menu court, et on voit tout de suite où l'on se trouve.
 */
export function defaultOpenGroups(pathname: string, groups: Array<{ id: string; items: Array<{ href: string }> }>): string[] {
  const active = groups.find((group) => group.items.some((item) => pathname === item.href || pathname.startsWith(`${item.href}/`)));
  return active ? [active.id] : [];
}
