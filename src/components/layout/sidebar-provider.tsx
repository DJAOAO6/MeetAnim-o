"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";

export type OpenBehavior = "hover" | "click";
export type SidebarDefaultState = "expanded" | "collapsed";

export type SidebarPreferences = {
  /** Barre réduite : s'ouvre-t-elle au survol, ou seulement au bouton ? */
  sidebarBehavior: OpenBehavior;
  /** État de la barre : le bouton de la barre écrit ici lui aussi. */
  defaultState: SidebarDefaultState;
};

type SidebarContextValue = {
  /** Repli permanent choisi par l'utilisateur. */
  collapsed: boolean;
  /** Barre réduite mais affichée temporairement par-dessus le contenu. */
  hoverExpanded: boolean;
  /** Vrai quand les libellés sont visibles, pour l'une ou l'autre raison. */
  showLabels: boolean;
  toggleCollapsed: () => void;
  handleSidebarHover: (inside: boolean) => void;
  preferences: SidebarPreferences;
  updatePreferences: (change: Partial<SidebarPreferences>) => void;
  /** Vrai quand l'appareil a une souris : sans elle, le survol n'existe pas. */
  pointerFine: boolean;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

const LEGACY_COLLAPSED_KEY = "1002pattes.sidebar.collapsed";
const PREFERENCES_KEY = "1002pattes.sidebar.preferences";

const defaultPreferences: SidebarPreferences = { sidebarBehavior: "hover", defaultState: "expanded" };

// Délai choisi pour absorber les trajectoires de souris : trop court, la
// barre clignote quand on traverse l'écran ; trop long, elle paraît lente.
const SIDEBAR_CLOSE_DELAY = 300;

function readStored<T>(key: string, fallback: T, parse: (raw: string) => T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : parse(raw);
  } catch {
    // Navigation privée ou stockage refusé : valeurs par défaut.
    return fallback;
  }
}

function readPreferences(): SidebarPreferences {
  const stored = readStored<Partial<SidebarPreferences> | null>(PREFERENCES_KEY, null, (raw) => JSON.parse(raw) as Partial<SidebarPreferences>);
  // Reprise de l'ancienne clé, écrite quand l'état de la barre vivait à part :
  // sans elle, une barre laissée réduite se rouvrirait toute seule à la mise
  // à jour.
  const legacy = readStored<SidebarDefaultState | null>(LEGACY_COLLAPSED_KEY, null, (raw) => (raw === "1" ? "collapsed" : "expanded"));
  // Champ par champ, et pas l'objet stocké tel quel : il peut encore porter
  // `menuBehavior`, le réglage d'ouverture des catégories, sans objet depuis
  // que le menu est à plat. Ignoré ici, il disparaît du stockage à la
  // prochaine écriture.
  return {
    sidebarBehavior: stored?.sidebarBehavior === "click" || stored?.sidebarBehavior === "hover" ? stored.sidebarBehavior : defaultPreferences.sidebarBehavior,
    defaultState: stored?.defaultState === "collapsed" || stored?.defaultState === "expanded" ? stored.defaultState : legacy ?? defaultPreferences.defaultState,
  };
}

const POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * Souris ou doigt ? Lu directement depuis le navigateur plutôt que copié dans
 * un état React : la valeur appartient à la plateforme, useSyncExternalStore
 * la suit sans rendu superflu et renvoie `false` au rendu serveur, où la
 * question n'a pas de réponse.
 */
function subscribePointer(onChange: () => void): () => void {
  const query = window.matchMedia(POINTER_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readPointerFine(): boolean {
  return window.matchMedia(POINTER_QUERY).matches;
}

function write(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* stockage indisponible */ }
}

/**
 * Les préférences de la barre latérale vivent dans le navigateur, que le
 * serveur ne connaît pas. Les lire pendant le premier rendu faisait diverger
 * la page rendue par le serveur (barre dépliée) de celle du navigateur (barre
 * repliée) : React jetait alors tout l'arbre du tableau de bord pour le
 * reconstruire — clignotement à l'écran, et deux copies de la page le temps
 * de la reconstruction.
 *
 * Elles sont donc lues comme ce qu'elles sont : une donnée extérieure à
 * React, avec une valeur connue côté serveur (les préférences par défaut) et
 * la valeur réelle côté navigateur.
 */
let storedPreferences: SidebarPreferences | null = null;
const preferencesListeners = new Set<() => void>();

function subscribePreferences(onChange: () => void): () => void {
  preferencesListeners.add(onChange);
  return () => { preferencesListeners.delete(onChange); };
}

function preferencesSnapshot(): SidebarPreferences {
  // Même objet tant que rien ne change : useSyncExternalStore compare les
  // instantanés par identité.
  storedPreferences ??= readPreferences();
  return storedPreferences;
}

function serverPreferencesSnapshot(): SidebarPreferences {
  return defaultPreferences;
}

function savePreferences(next: SidebarPreferences): void {
  storedPreferences = next;
  write(PREFERENCES_KEY, JSON.stringify(next));
  // Ancienne clé, remplacée par les préférences : elle ne doit pas ressusciter
  // un état que l'utilisateur vient de changer.
  try { window.localStorage.removeItem(LEGACY_COLLAPSED_KEY); } catch { /* stockage indisponible */ }
  for (const listener of preferencesListeners) listener();
}

/**
 * Comportement de la navigation latérale.
 *
 * Trois états bien distincts, et c'est le cœur du sujet :
 *
 * - `expanded` : barre réellement ouverte, le contenu est décalé d'autant ;
 * - `collapsed` : barre réduite, le contenu occupe la place rendue ;
 * - `hoverExpanded` : barre réduite mais dépliée par-dessus le contenu, le
 *   temps que la souris reste dessus. **Le contenu ne bouge pas** : c'est ce
 *   qui distingue ce survol d'une vraie ouverture, et ce qui évite de
 *   recalculer l'agenda, les graphiques et les cartes à chaque passage de
 *   souris.
 *
 * Seule la largeur permanente est publiée dans --sidebar-width, la variable
 * que lit la mise en page : un survol ne peut donc pas déplacer le contenu,
 * même par erreur.
 *
 * Les préférences vivent dans le stockage local, comme celles du thème
 * (dashboard-theme-provider.tsx) : ce sont des réglages d'affichage propres à
 * l'écran utilisé, pas des données du cabinet.
 */
export function SidebarProvider({ children }: { children: ReactNode }) {
  const preferences = useSyncExternalStore(subscribePreferences, preferencesSnapshot, serverPreferencesSnapshot);

  // Un seul endroit décide de l'état de la barre. Le bouton de la barre et le
  // réglage des paramètres écrivent tous deux ici, donc ils ne peuvent pas se
  // contredire — et le réglage n'est pas un vœu pieux qu'un état stocké
  // ailleurs viendrait écraser au chargement suivant.
  const collapsed = preferences.defaultState === "collapsed";

  const [hoverExpanded, setHoverExpanded] = useState(false);

  const closeTimer = useRef<number | null>(null);
  // Voir toggleCollapsed : le survol reste neutralisé tant que le curseur n'a
  // pas quitté la barre après un repli demandé au bouton.
  const hoverSuppressed = useRef(false);

  // Le survol n'a de sens qu'avec un vrai pointeur : au doigt, il n'existe
  // pas d'état « la souris est dessus », et un menu qui s'ouvrirait au
  // premier contact gênerait plus qu'il n'aiderait.
  const pointerFine = useSyncExternalStore(subscribePointer, readPointerFine, () => false);

  useEffect(() => {
    // Largeur permanente uniquement : le survol n'entre jamais dans ce calcul.
    document.body.style.setProperty("--sidebar-width", collapsed ? "76px" : "260px");
    document.body.dataset.sidebar = collapsed ? "collapsed" : "expanded";
  }, [collapsed]);

  useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setHoverExpanded(false);
    const current = preferencesSnapshot();
    const next = current.defaultState === "collapsed" ? "expanded" : "collapsed";
    // Le bouton est dans la barre : en la repliant, le contenu change sous
    // le curseur et le navigateur renvoie un survol. Sans ce verrou, la
    // barre se rouvrirait aussitôt en flyout et le bouton semblerait sans
    // effet. Le verrou tombe dès que le curseur sort vraiment de la barre —
    // et il n'est posé qu'au repli, un déploiement n'ayant rien à craindre
    // d'un survol.
    hoverSuppressed.current = next === "collapsed";
    // Vrai changement de largeur : les cartes et graphiques dimensionnés en
    // pixels ne se redessinent que sur un redimensionnement. Jamais pendant
    // un simple survol, qui ne change rien à la place disponible.
    window.setTimeout(() => window.dispatchEvent(new Event("resize")), 240);
    savePreferences({ ...current, defaultState: next });
  }, []);

  const handleSidebarHover = useCallback((inside: boolean) => {
    if (!pointerFine || preferences.sidebarBehavior !== "hover") return;
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    if (inside) {
      if (!hoverSuppressed.current) setHoverExpanded(true);
      return;
    }
    hoverSuppressed.current = false;
    // Délai avant repli : un passage entre deux éléments, ou un aller-retour
    // vers un sous-menu, ne doit pas refermer la barre.
    closeTimer.current = window.setTimeout(() => setHoverExpanded(false), SIDEBAR_CLOSE_DELAY);
  }, [pointerFine, preferences.sidebarBehavior]);

  const updatePreferences = useCallback((change: Partial<SidebarPreferences>) => {
    savePreferences({ ...preferencesSnapshot(), ...change });
    // Application immédiate : passer en manuel referme un survol en cours,
    // sans quoi le réglage semblerait sans effet jusqu'au geste suivant.
    if (change.sidebarBehavior === "click") setHoverExpanded(false);
  }, []);

  const value = useMemo<SidebarContextValue>(() => ({
    collapsed,
    hoverExpanded: collapsed && hoverExpanded,
    showLabels: !collapsed || hoverExpanded,
    toggleCollapsed,
    handleSidebarHover,
    preferences,
    updatePreferences,
    pointerFine,
  }), [collapsed, hoverExpanded, toggleCollapsed, handleSidebarHover, preferences, updatePreferences, pointerFine]);

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) throw new Error("useSidebar doit être utilisé dans SidebarProvider.");
  return context;
}
