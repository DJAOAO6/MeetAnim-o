"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";

export type TabItem<T extends string> = { id: T; label: string; icon?: ReactNode };

type TabsProps<T extends string> = {
  tabs: ReadonlyArray<TabItem<T>>;
  value: T;
  onChange: (id: T) => void;
  /** Nom de la rangée d'onglets pour les lecteurs d'écran. */
  label: string;
  /** Relie chaque onglet à son panneau (`TabPanel` avec le même préfixe). Sans lui, pas de panneau déclaré. */
  idPrefix?: string;
  /** `sm` : texte plus petit pour une barre déjà chargée ; la hauteur reste de 44 px. */
  size?: "md" | "sm";
  /** Les onglets se partagent la largeur (deux onglets dans un cadre étroit). */
  stretch?: boolean;
  className?: string;
};

const FADE = "1.75rem";

/**
 * Onglets (PLAN-BOUTONS, 3.12) : un seul composant pour passer d'un panneau à
 * l'autre — Paramètres, Administration, modes de la carte, disponibilités.
 *
 * - `tablist`, `tab`, `aria-selected` ; flèches gauche et droite, Début, Fin ;
 * - l'onglet actif est plein, à la couleur de la marque ;
 * - quand ils ne tiennent pas dans la largeur (téléphone), la rangée défile,
 *   un fondu marque le bord où il en reste, et l'onglet actif est amené dans
 *   la zone visible — « Intégrations » ne reste plus hors de l'écran sans
 *   que rien ne l'annonce.
 *
 * Un choix qui ne change pas de panneau (Jour / Semaine / Mois) n'est pas un
 * onglet : c'est un sélecteur segmenté, avec `aria-pressed`.
 */
export function Tabs<T extends string>({ tabs, value, onChange, label, idPrefix, size = "md", stretch = false, className = "" }: TabsProps<T>) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ start: false, end: false });

  // Où reste-t-il des onglets ? Mesuré au défilement et à chaque changement
  // de largeur (l'observateur donne aussi la première mesure).
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    function measure() {
      if (!scroller) return;
      const start = scroller.scrollLeft > 1;
      const end = scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1;
      setMore((current) => (current.start === start && current.end === end ? current : { start, end }));
    }
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    scroller.addEventListener("scroll", measure, { passive: true });
    return () => {
      observer.disconnect();
      scroller.removeEventListener("scroll", measure);
    };
  }, []);

  // L'onglet actif dans la zone visible, à l'ouverture comme au changement.
  // Calculé sur la rangée seule : `scrollIntoView` ferait aussi défiler la page.
  useEffect(() => {
    const scroller = scrollerRef.current;
    const active = scroller?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
    if (!scroller || !active) return;
    const left = active.offsetLeft - scroller.offsetLeft;
    if (left < scroller.scrollLeft || left + active.offsetWidth > scroller.scrollLeft + scroller.clientWidth) {
      scroller.scrollTo({ left: left - (scroller.clientWidth - active.offsetWidth) / 2 });
    }
  }, [value]);

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const index = tabs.findIndex((tab) => tab.id === value);
    const next = event.key === "ArrowRight" ? tabs[(index + 1) % tabs.length]
      : event.key === "ArrowLeft" ? tabs[(index - 1 + tabs.length) % tabs.length]
      : event.key === "Home" ? tabs[0]
      : event.key === "End" ? tabs[tabs.length - 1]
      : null;
    if (!next) return;
    event.preventDefault();
    onChange(next.id);
    // L'onglet choisi garde le focus : les flèches enchaînent.
    scrollerRef.current?.querySelector<HTMLElement>(`[data-tab="${next.id}"]`)?.focus();
  }

  const mask = more.start || more.end
    ? `linear-gradient(to right, ${more.start ? "transparent" : "black"}, black ${FADE}, black calc(100% - ${FADE}), ${more.end ? "transparent" : "black"})`
    : undefined;

  return (
    <div
      ref={scrollerRef}
      role="tablist"
      aria-label={label}
      onKeyDown={handleKeyDown}
      style={mask ? { maskImage: mask, WebkitMaskImage: mask } : undefined}
      className={`flex max-w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {tabs.map((tab) => {
        const active = tab.id === value;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            data-tab={tab.id}
            id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
            aria-selected={active}
            aria-controls={idPrefix ? `${idPrefix}-panel-${tab.id}` : undefined}
            // Un seul arrêt de tabulation : les flèches font le reste.
            tabIndex={active ? 0 : -1}
            onClick={() => onChange(tab.id)}
            className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 whitespace-nowrap font-extrabold transition ${size === "md" ? "rounded-2xl px-4 text-sm" : "rounded-xl px-3 text-xs"} ${stretch ? "flex-1" : ""} ${
              active ? "bg-animeo text-white shadow-sm" : "text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

/** Le panneau d'un onglet : même préfixe que la rangée, pour que l'un annonce l'autre. */
export function TabPanel({ idPrefix, tab, className, children }: { idPrefix: string; tab: string; className?: string; children: ReactNode }) {
  return (
    <div role="tabpanel" id={`${idPrefix}-panel-${tab}`} aria-labelledby={`${idPrefix}-tab-${tab}`} className={className}>
      {children}
    </div>
  );
}
