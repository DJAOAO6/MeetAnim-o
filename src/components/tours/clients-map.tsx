"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { UnifiedSearch, type UnifiedSearchSelection } from "@/components/search/unified-search";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { useGeolocation } from "@/components/ui/use-geolocation";
import { animalSpeciesList, resolveSpeciesColor } from "@/data/species";
import { circleBounds, haversineDistanceKm, pointInGeometry, type GeoBounds, type TerritoryGeometry } from "@/lib/geo";
import { geocodeClientAddressAction } from "@/lib/clients-actions";
import { notify } from "@/lib/notify";
import type { AnimalSpecies, MapClient } from "@/data/tours";

const RealMap = dynamic(() => import("@/components/tours/real-map").then((mod) => mod.RealMap), {
  ssr: false,
  loading: () => <div className="flex h-[610px] items-center justify-center rounded-2xl border border-animeo-border bg-animeo-positive-soft text-sm font-bold text-animeo-muted">Chargement de la carte…</div>,
});

type ClientsMapProps = {
  clients: MapClient[];
  cabinetCoordinates?: { lat: number; lng: number } | null;
};

// Cercle autour d'un point : une adresse (épingle) ou une commune (contour
// affiché en plus, code INSEE pour le charger).
type PerimeterCenter = { lat: number; lng: number; label: string; pin?: boolean; communeCode?: string };
// Département ou région : le vrai territoire, jamais un cercle autour de sa
// préfecture. Le filtre attend son contour (chargé à la demande).
type TerritoryPerimeter = {
  type: "departement" | "region";
  code: string;
  label: string;
  status: "loading" | "ready" | "error";
  geometry?: TerritoryGeometry;
  bounds?: GeoBounds;
};
type LoadedTerritory = { geometry: TerritoryGeometry; bounds: GeoBounds };

const territoryTypeLabels: Record<TerritoryPerimeter["type"], string> = { departement: "Département", region: "Région" };

async function fetchTerritory(type: "commune" | "departement" | "region", code: string): Promise<LoadedTerritory | null> {
  try {
    const response = await fetch(`/api/territory?type=${type}&code=${encodeURIComponent(code)}`);
    if (!response.ok) return null;
    return (await response.json()) as LoadedTerritory;
  } catch {
    return null;
  }
}
type SortMode = "name" | "distance";
type ProximityOrigin = { lat: number; lng: number; label: string };

const nameCollator = new Intl.Collator("fr-FR", { sensitivity: "base" });
const kmFormatter = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
// Distance à vol d'oiseau, dite comme telle : jamais une durée de trajet,
// qui demanderait un vrai calcul d'itinéraire.
const formatKm = (km: number) => `${kmFormatter.format(km)} km`;
type FilterToken = { key: string; label: string; onRemove: () => void };

const DEFAULT_PERIMETER_RADIUS_KM = 15;
// Paliers, pas de curseur continu : chaque changement de valeur redessine la
// carte, et la décision réelle ("mon secteur / ma ville / mon département")
// se résume à trois choix, pas cent — voir le prompt dédié.
const PERIMETER_RADIUS_TIERS = [15, 30, 50];
// Sous cette largeur, la poignée de redimensionnement du cercle disparaît
// (tirer une poignée avec le doigt masque la carte sur mobile) : seuls les
// paliers restent.
const CIRCLE_HANDLE_MIN_WIDTH_QUERY = "(min-width: 640px)";

export function ClientsMap({ clients, cabinetCoordinates = null }: ClientsMapProps) {
  const { theme } = useDashboardTheme();
  const [selectedSpecies, setSelectedSpecies] = useState<AnimalSpecies[]>([]);
  const [speciesPanelOpen, setSpeciesPanelOpen] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [query, setQuery] = useState("");
  // Aucune sélection à l'arrivée : la carte montre d'abord toute la
  // clientèle. Une fiche ne s'ouvre qu'à un geste (marqueur, liste, recherche).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Tri de la liste et ordre de « Précédent / Suivant ». Proximité : depuis
  // le client choisi au moment du tri, sinon le lieu d'exercice — un point
  // fixe, pour que l'ordre ne bouge pas à chaque client parcouru.
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [proximityOrigin, setProximityOrigin] = useState<ProximityOrigin | null>(null);
  // Jamais activée par défaut : la demande d'autorisation du navigateur est
  // intrusive, ne doit s'afficher qu'à un geste explicite.
  const [showLiveLocation, setShowLiveLocation] = useState(false);
  const { position: liveLocation, error: liveLocationError } = useGeolocation(showLiveLocation);

  const [perimeterCenter, setPerimeterCenter] = useState<PerimeterCenter | null>(null);
  const [territory, setTerritory] = useState<TerritoryPerimeter | null>(null);
  // Contour de la commune choisie : affiché autour du cercle, sans filtrer.
  const [communeArea, setCommuneArea] = useState<{ code: string; geometry: TerritoryGeometry } | null>(null);
  // Chaque nouveau lieu invalide les chargements en cours du précédent.
  const placeRequestRef = useRef(0);
  // Recadrage demandé à la carte (cercle, territoire, tous les clients).
  const [fitTarget, setFitTarget] = useState<(GeoBounds & { token: string }) | null>(null);
  const fitTokenRef = useRef(0);
  const [perimeterRadiusKm, setPerimeterRadiusKm] = useState(DEFAULT_PERIMETER_RADIUS_KM);
  const [radiusPanelOpen, setRadiusPanelOpen] = useState(false);
  // Change uniquement pour un rayon fixé hors glisser (palier, nouveau
  // centre) : force CircleResizeHandle à se replacer au bord du cercle sans
  // jamais interrompre un glisser en cours (voir real-map.tsx).
  const [circleHandleResetKey, setCircleHandleResetKey] = useState(0);
  // Sous 640px, la poignée de redimensionnement disparaît (voir le prompt) :
  // même motif que le thème système (dashboard-theme-provider.tsx).
  const [showCircleHandle, setShowCircleHandle] = useState(
    () => typeof window !== "undefined" && window.matchMedia(CIRCLE_HANDLE_MIN_WIDTH_QUERY).matches,
  );

  const speciesPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (speciesPanelRef.current && !speciesPanelRef.current.contains(event.target as Node)) setSpeciesPanelOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const radiusPanelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (radiusPanelRef.current && !radiusPanelRef.current.contains(event.target as Node)) setRadiusPanelOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const media = window.matchMedia(CIRCLE_HANDLE_MIN_WIDTH_QUERY);
    function handleChange(event: MediaQueryListEvent) {
      setShowCircleHandle(event.matches);
    }
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  function toggleSpecies(species: AnimalSpecies) {
    setSelectedSpecies((current) => (current.includes(species) ? current.filter((item) => item !== species) : [...current, species]));
  }

  function fitTo(bounds: GeoBounds) {
    fitTokenRef.current += 1;
    setFitTarget({ ...bounds, token: String(fitTokenRef.current) });
  }

  function applyCirclePerimeter(center: PerimeterCenter) {
    placeRequestRef.current += 1;
    setTerritory(null);
    setCommuneArea(null);
    setPerimeterCenter(center);
    setPerimeterRadiusKm(DEFAULT_PERIMETER_RADIUS_KM);
    setCircleHandleResetKey((current) => current + 1);
    fitTo(circleBounds(center, DEFAULT_PERIMETER_RADIUS_KM));
    if (center.communeCode) {
      const requestId = placeRequestRef.current;
      const code = center.communeCode;
      void fetchTerritory("commune", code).then((loaded) => {
        if (loaded && requestId === placeRequestRef.current) setCommuneArea({ code, geometry: loaded.geometry });
      });
    }
  }

  function applyTerritoryPerimeter(next: Pick<TerritoryPerimeter, "type" | "code" | "label">) {
    placeRequestRef.current += 1;
    const requestId = placeRequestRef.current;
    setPerimeterCenter(null);
    setCommuneArea(null);
    setTerritory({ ...next, status: "loading" });
    void fetchTerritory(next.type, next.code).then((loaded) => {
      if (requestId !== placeRequestRef.current) return;
      if (!loaded) { setTerritory({ ...next, status: "error" }); return; }
      setTerritory({ ...next, status: "ready", geometry: loaded.geometry, bounds: loaded.bounds });
      fitTo(loaded.bounds);
    });
  }

  function clearAllFilters() {
    setSelectedSpecies([]);
    setDueOnly(false);
    setQuery("");
    clearPerimeter();
  }

  // Fixe le rayon hors glisser (palier cliqué, nouveau centre choisi) : la
  // poignée doit se replacer au bord du cercle en conséquence.
  function setPerimeterRadiusExternally(km: number) {
    setPerimeterRadiusKm(km);
    setCircleHandleResetKey((current) => current + 1);
    // Toujours tout le cercle à l'écran : dézoome pour 50 km, rezoome pour 15.
    if (perimeterCenter) fitTo(circleBounds(perimeterCenter, km));
  }

  // Pendant un glisser, seule la valeur en direct (pour le cercle, le jeton
  // et les paliers) change ; au relâchement (phase "commit"), la valeur est
  // arrondie à 5 km — jamais de nouvel appel réseau ici, le filtrage par
  // périmètre est déjà entièrement local (voir clientsInPerimeter).
  function handleCircleRadiusChange(radiusKm: number, phase: "drag" | "commit") {
    // Pendant le glisser, la carte ne bouge pas ; au relâchement, elle
    // recadre sur le cercle retenu.
    if (phase === "commit") {
      const km = Math.max(5, Math.round(radiusKm / 5) * 5);
      setPerimeterRadiusKm(km);
      if (perimeterCenter) fitTo(circleBounds(perimeterCenter, km));
    } else setPerimeterRadiusKm(radiusKm);
  }

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return clients.filter((client) => {
      const matchesSpecies = selectedSpecies.length === 0 || selectedSpecies.includes(client.species);
      const matchesReminder = !dueOnly || client.dueForReminder;
      const matchesQuery = !normalizedQuery || `${client.ownerName} ${client.animalName}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      return matchesSpecies && matchesReminder && matchesQuery;
    });
  }, [clients, dueOnly, query, selectedSpecies]);

  // Retirer le périmètre : cercle, épingle, contour et filtre partent, et la
  // carte revient sur l'ensemble des clients.
  function clearPerimeter() {
    placeRequestRef.current += 1;
    setPerimeterCenter(null);
    setTerritory(null);
    setCommuneArea(null);
    setRadiusPanelOpen(false);
    const located = filteredClients.filter((client) => client.coordinates).map((client) => client.coordinates!);
    if (located.length > 0) {
      fitTo({
        south: Math.min(...located.map((point) => point.lat)),
        north: Math.max(...located.map((point) => point.lat)),
        west: Math.min(...located.map((point) => point.lng)),
        east: Math.max(...located.map((point) => point.lng)),
      });
    }
  }

  const clientsInPerimeter = useMemo(() => {
    // Département / région : les clients situés dans le territoire, une fois
    // son contour chargé (avant, rien n'est filtré plutôt que tout masqué).
    if (territory) {
      const geometry = territory.status === "ready" ? territory.geometry : undefined;
      if (!geometry) return filteredClients;
      return filteredClients.filter((client) => client.coordinates && pointInGeometry(client.coordinates, geometry));
    }
    if (!perimeterCenter) return filteredClients;
    // Un client sans coordonnées ne peut pas être comparé à un centre de
    // périmètre : exclu plutôt que deviné.
    return filteredClients.filter((client) => client.coordinates && haversineDistanceKm(perimeterCenter, client.coordinates) <= perimeterRadiusKm);
  }, [filteredClients, perimeterCenter, perimeterRadiusKm, territory]);

  // Nombre de clients par palier, calculé localement sur les clients déjà
  // chargés (jamais un aller-retour réseau) : affiché dans le panneau de
  // rayon, indépendant de la valeur actuellement retenue.
  const perimeterTierCounts = useMemo(() => {
    if (!perimeterCenter) return {} as Record<number, number>;
    const counts: Record<number, number> = {};
    for (const km of PERIMETER_RADIUS_TIERS) {
      counts[km] = filteredClients.filter((client) => client.coordinates && haversineDistanceKm(perimeterCenter, client.coordinates) <= km).length;
    }
    return counts;
  }, [filteredClients, perimeterCenter]);

  // Clients sans coordonnées : exclus de tout calcul de périmètre, jamais
  // devinés — signalés explicitement plutôt que silencieusement absents.
  const unlocatedFilteredCount = useMemo(() => filteredClients.filter((client) => !client.coordinates).length, [filteredClients]);

  const hasPerimeter = Boolean(perimeterCenter || territory);
  const visibleClients = hasPerimeter ? clientsInPerimeter : filteredClients;
  const locatedClients = visibleClients.filter((client) => client.coordinates);
  const selectedClient = selectedId ? visibleClients.find((client) => client.id === selectedId) ?? null : null;

  const distanceFrom = (client: MapClient) => (sortMode === "distance" && proximityOrigin && client.coordinates ? haversineDistanceKm(proximityOrigin, client.coordinates) : null);
  const byName = (a: MapClient, b: MapClient) => nameCollator.compare(a.ownerName, b.ownerName) || nameCollator.compare(a.animalName, b.animalName);
  // Clients localisés, dans l'ordre de la liste : c'est aussi l'ordre de
  // « Précédent / Suivant ». Les clients sans position suivent à part.
  const orderedLocated = [...locatedClients].sort((a, b) => {
    const da = distanceFrom(a);
    const db = distanceFrom(b);
    return da !== null && db !== null ? da - db || byName(a, b) : byName(a, b);
  });
  const orderedUnlocated = visibleClients.filter((client) => !client.coordinates).sort(byName);
  const navIndex = selectedClient?.coordinates ? orderedLocated.findIndex((client) => client.id === selectedClient.id) : -1;

  // Précédent / Suivant ne parcourent que les clients localisés (la carte
  // n'a rien à montrer pour les autres). Sans sélection : Suivant part du
  // premier, Précédent du dernier.
  function goTo(delta: 1 | -1) {
    if (orderedLocated.length === 0) return;
    const next = navIndex === -1 ? (delta > 0 ? 0 : orderedLocated.length - 1) : navIndex + delta;
    if (next < 0 || next >= orderedLocated.length) return;
    setSelectedId(orderedLocated[next].id);
  }

  const proximityCandidate: ProximityOrigin | null = selectedClient?.coordinates
    ? { ...selectedClient.coordinates, label: selectedClient.ownerName }
    : cabinetCoordinates ? { ...cabinetCoordinates, label: "votre lieu d’exercice" } : null;
  // Choisir « Proximité » (même s'il est déjà actif) fixe le point de départ
  // à l'instant : le client choisi, sinon le lieu d'exercice.
  function chooseSort(mode: SortMode) {
    if (mode === "distance") {
      if (!proximityCandidate) return;
      setProximityOrigin(proximityCandidate);
    }
    setSortMode(mode);
  }

  // Flèches gauche/droite quand le focus est dans la carte ou la liste —
  // jamais dans un champ, où elles déplacent le curseur de saisie.
  function handleNavigationKeys(event: React.KeyboardEvent) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    const target = event.target as HTMLElement;
    if (target.closest("input, textarea, select, [contenteditable='true']")) return;
    event.preventDefault();
    goTo(event.key === "ArrowRight" ? 1 : -1);
  }

  const navigationAnnouncement = selectedClient
    ? navIndex >= 0
      ? `${selectedClient.ownerName}, ${selectedClient.city}, ${navIndex + 1} sur ${orderedLocated.length}.`
      : `${selectedClient.ownerName}, position inconnue.`
    : "";

  // Un client sorti des filtres, du périmètre ou de la recherche n'est plus
  // sélectionné : il ne revient pas sélectionné s'il réapparaît.
  // Ajusté pendant le rendu (motif React « état dérivé d'un changement ») :
  // pas d'effet, donc pas de rendu intermédiaire avec une sélection fantôme.
  if (selectedId !== null && !selectedClient) setSelectedId(null);

  // Même geste pour sélectionner et désélectionner : un second clic sur le
  // client déjà choisi (marqueur ou ligne) referme sa fiche.
  function toggleSelection(id: string) {
    setSelectedId((current) => (current === id ? null : id));
  }

  // Échap referme la fiche — sauf dans un champ, où Échap appartient au champ.
  useEffect(() => {
    if (!selectedId) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable='true']"))) return;
      setSelectedId(null);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedId]);

  // La ligne du client choisi sur la carte se montre dans la liste. Seule la
  // liste défile (jamais la page) : sur téléphone, la liste est sous la
  // carte, et choisir un marqueur ne doit pas faire sauter l'écran.
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = listRef.current;
    if (!selectedId || !list) return;
    const row = list.querySelector<HTMLElement>(`[data-client-row="${CSS.escape(selectedId)}"]`);
    if (!row) return;
    // Position de la ligne dans le contenu de la liste, quel que soit
    // l'ancêtre positionné : mesurée à l'écran, rapportée au défilement.
    const rowTop = row.getBoundingClientRect().top - list.getBoundingClientRect().top + list.scrollTop;
    if (rowTop < list.scrollTop) list.scrollTop = rowTop;
    else if (rowTop + row.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = rowTop + row.offsetHeight - list.clientHeight;
  }, [selectedId]);
  // Sur la carte : tous les clients filtrés. Ceux hors du périmètre restent
  // visibles pour le contexte, atténués et non cliquables ; la liste, elle,
  // ne montre que ceux du périmètre.
  const insidePerimeter = new Set(visibleClients.map((client) => client.id));
  const points = filteredClients.filter((client) => client.coordinates).map((client) => {
    const outside = hasPerimeter && !insidePerimeter.has(client.id);
    return {
      id: client.id,
      lat: client.coordinates!.lat,
      lng: client.coordinates!.lng,
      label: client.avatar,
      title: `${client.ownerName} · ${client.animalName} · ${client.city} · ${client.species}${client.dueForReminder ? " · À relancer" : ""}${outside ? " · hors du périmètre" : ""}`,
      color: resolveSpeciesColor(theme.speciesColors, client.species),
      badge: client.dueForReminder,
      dimmed: outside,
    };
  });

  // Marges du recadrage : la fiche ouverte occupe le bas à droite (large) ou
  // le bas de la carte (étroit) — le cercle doit rester visible à côté.
  const fitPadding = selectedClient?.coordinates
    ? showCircleHandle ? { topLeft: [40, 40] as [number, number], bottomRight: [340, 40] as [number, number] } : { topLeft: [24, 24] as [number, number], bottomRight: [24, 300] as [number, number] }
    : undefined;

  // Sélectionner un lieu dans la recherche unifiée applique directement un
  // périmètre : le seul moyen d'en définir un depuis la phase 2 (l'ancien
  // "Créer un périmètre" + clic sur la carte, qui laissait deviner un point
  // sans coordonnées vérifiées, a été retiré).
  function handleUnifiedSelect(selection: UnifiedSearchSelection) {
    if (selection.kind === "place") {
      const { place } = selection;
      const code = place.id.slice(place.id.indexOf("-") + 1);
      if (place.type === "commune" && place.lat !== undefined && place.lng !== undefined) applyCirclePerimeter({ lat: place.lat, lng: place.lng, label: place.label, communeCode: code });
      else if (place.type !== "commune") applyTerritoryPerimeter({ type: place.type, code, label: place.label });
      return;
    }
    if (selection.kind === "address") {
      const { address } = selection;
      applyCirclePerimeter({ lat: address.latitude, lng: address.longitude, label: address.label, pin: true });
      return;
    }
    // "zone" jamais sélectionnable ici (voir sources={...} sur <UnifiedSearch>).
    if (selection.kind !== "client" && selection.kind !== "animal") return;
    const target = selection.kind === "client"
      ? clients.find((client) => client.clientId === selection.client.id)
      : clients.find((client) => client.id === selection.animal.id);
    if (!target) return;
    setSelectedId(target.id);
  }

  // Filtres actifs seulement : les filtres inactifs se rangent (bouton
  // Espèce, champ de recherche), ceux-ci restent visibles pour qu'un
  // résultat filtré reste toujours explicable en un coup d'œil. Le
  // périmètre a son propre jeton (déroulant vers les paliers) rendu à part
  // ci-dessous, pas dans cette liste générique "clic = retire".
  const activeFilterTokens: FilterToken[] = [
    ...selectedSpecies.map((species): FilterToken => ({ key: `species-${species}`, label: species, onRemove: () => toggleSpecies(species) })),
    ...(dueOnly ? [{ key: "due", label: "À relancer", onRemove: () => setDueOnly(false) }] : []),
  ];

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0 sm:flex-1"><UnifiedSearch onSelect={handleUnifiedSelect} onSubmitFreeText={setQuery} sources={["client", "animal", "place", "address"]} /></div>

          <div className="flex flex-wrap items-center gap-2">
            <div ref={speciesPanelRef} className="relative">
              <button
                type="button"
                onClick={() => setSpeciesPanelOpen((current) => !current)}
                aria-haspopup="true"
                aria-expanded={speciesPanelOpen}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition ${selectedSpecies.length > 0 ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}
              >
                {speciesButtonLabel(selectedSpecies)}
                <ChevronIcon />
              </button>
              {speciesPanelOpen ? (
                <div role="group" aria-label="Filtrer par espèce" className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl border border-animeo-border bg-white p-1.5 shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]">
                  {animalSpeciesList.map((species) => (
                    <label key={species} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg">
                      <input type="checkbox" checked={selectedSpecies.includes(species)} onChange={() => toggleSpecies(species)} className="h-4 w-4 shrink-0 rounded border-animeo-border text-animeo focus:ring-animeo" />
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, species) }} />
                      {species}
                    </label>
                  ))}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              onClick={() => setDueOnly((current) => !current)}
              aria-pressed={dueOnly}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition ${dueOnly ? "bg-animeo-accent text-animeo-dark" : "bg-animeo-warning-soft text-animeo-warning hover:bg-animeo-warning-soft"}`}
            >
              <Icon name="bell" className="h-3.5 w-3.5" />
              À relancer
            </button>

            <span key={visibleClients.length} className="animate-count-pulse inline-block text-xs font-bold text-animeo-muted">
              {visibleClients.length} client{visibleClients.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {activeFilterTokens.length > 0 || hasPerimeter ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-animeo-border-soft pt-3">
            {activeFilterTokens.map((token) => (
              <button key={token.key} type="button" onClick={token.onRemove} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo-soft px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft-strong">
                {token.label}
                <span aria-hidden="true" className="text-sm leading-none text-animeo-muted">×</span>
              </button>
            ))}

            {perimeterCenter ? (
              <div ref={radiusPanelRef} className="relative">
                <div className="inline-flex min-h-11 items-stretch overflow-hidden rounded-xl bg-animeo-soft text-xs font-extrabold text-animeo-dark">
                  <button
                    type="button"
                    onClick={() => setRadiusPanelOpen((current) => !current)}
                    aria-haspopup="true"
                    aria-expanded={radiusPanelOpen}
                    className="inline-flex items-center gap-1 px-3 transition hover:bg-animeo-soft-strong"
                  >
                    {Math.round(perimeterRadiusKm)} km autour de {perimeterCenter.label}
                    <ChevronIcon />
                  </button>
                  <button type="button" onClick={clearPerimeter} aria-label="Retirer le filtre de périmètre" className="inline-flex items-center px-2.5 text-animeo-muted transition hover:bg-animeo-soft-strong hover:text-animeo-dark">×</button>
                </div>
                {radiusPanelOpen ? (
                  <div role="group" aria-label="Choisir le rayon du périmètre" className="absolute z-20 mt-1.5 w-56 rounded-xl border border-animeo-border bg-white p-1.5 shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]">
                    {PERIMETER_RADIUS_TIERS.map((km) => {
                      const count = perimeterTierCounts[km] ?? 0;
                      const active = Math.round(perimeterRadiusKm) === km;
                      return (
                        <button
                          key={km}
                          type="button"
                          onClick={() => { setPerimeterRadiusExternally(km); setRadiusPanelOpen(false); }}
                          aria-pressed={active}
                          className={`flex min-h-11 w-full items-center justify-between rounded-lg px-2.5 text-sm font-bold transition ${active ? "bg-animeo-soft text-animeo-dark" : "text-animeo-dark hover:bg-animeo-bg"}`}
                        >
                          <span>{km} km</span>
                          <span className="text-xs font-semibold text-animeo-muted">{count} client{count > 1 ? "s" : ""}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* Département / région : pas de rayon, le territoire lui-même. */}
            {territory ? (
              <div className="inline-flex min-h-11 items-stretch overflow-hidden rounded-xl bg-animeo-soft text-xs font-extrabold text-animeo-dark">
                <span className="inline-flex items-center px-3">{territoryTypeLabels[territory.type]} · {territory.label}</span>
                <button type="button" onClick={clearPerimeter} aria-label="Retirer le filtre de territoire" className="inline-flex items-center px-2.5 text-animeo-muted transition hover:bg-animeo-soft-strong hover:text-animeo-dark">×</button>
              </div>
            ) : null}

            <button type="button" onClick={clearAllFilters} className="inline-flex min-h-11 items-center px-2 text-xs font-extrabold text-animeo-muted underline decoration-dotted underline-offset-4 transition hover:text-animeo-dark">
              Tout effacer
            </button>
          </div>
        ) : null}

        {perimeterCenter ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-animeo-soft px-4 py-3 text-sm text-animeo-dark">
            <Icon name="map" className="h-5 w-5 shrink-0 text-animeo" />
            <p>
              <strong>{clientsInPerimeter.length} client{clientsInPerimeter.length > 1 ? "s" : ""}</strong> dans un rayon de <strong>{Math.round(perimeterRadiusKm)} km</strong> autour de <strong>{perimeterCenter.label}</strong>.
              {unlocatedFilteredCount > 0 ? ` ${unlocatedFilteredCount} client${unlocatedFilteredCount > 1 ? "s" : ""} non localisé${unlocatedFilteredCount > 1 ? "s" : ""}, exclu${unlocatedFilteredCount > 1 ? "s" : ""} de ce calcul.` : " Utile pour évaluer la création d’une nouvelle tournée."}
            </p>
          </div>
        ) : null}

        {territory ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-animeo-soft px-4 py-3 text-sm text-animeo-dark" role="status">
            <Icon name="map" className="h-5 w-5 shrink-0 text-animeo" />
            {territory.status === "ready" ? (
              <p>
                <strong>{clientsInPerimeter.length} client{clientsInPerimeter.length > 1 ? "s" : ""}</strong> dans le territoire <strong>{territory.label}</strong> ({territoryTypeLabels[territory.type].toLowerCase()}).
                {unlocatedFilteredCount > 0 ? ` ${unlocatedFilteredCount} client${unlocatedFilteredCount > 1 ? "s" : ""} non localisé${unlocatedFilteredCount > 1 ? "s" : ""}, exclu${unlocatedFilteredCount > 1 ? "s" : ""} de ce calcul.` : ""}
              </p>
            ) : territory.status === "loading" ? (
              <p>Chargement du contour de <strong>{territory.label}</strong>…</p>
            ) : (
              <p className="flex flex-wrap items-center gap-x-2">
                Le contour de <strong>{territory.label}</strong> n’a pas pu être chargé.
                <button type="button" onClick={() => applyTerritoryPerimeter(territory)} className="font-extrabold text-animeo underline underline-offset-2">Réessayer</button>
              </p>
            )}
          </div>
        ) : null}
      </Card>

      {/* Annonce du client parcouru, pour les lecteurs d'écran. */}
      <p aria-live="polite" className="sr-only" data-testid="map-navigation-live">{navigationAnnouncement}</p>

      <div onKeyDown={handleNavigationKeys} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-extrabold text-animeo-dark">Répartition des clients</h2>
              <p className="mt-0.5 text-xs text-animeo-muted">Cliquez sur un point pour afficher sa fiche</p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-[10px] font-bold text-animeo-muted">
              {animalSpeciesList.map((item) => (
                <span key={item} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, item) }} />{item}</span>
              ))}
              <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-animeo-accent shadow-sm" />À relancer</span>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setShowLiveLocation((current) => !current)}
              aria-pressed={showLiveLocation}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${showLiveLocation ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
            >
              📍 {showLiveLocation ? "Masquer ma position" : "Afficher ma position"}
            </button>
            {showLiveLocation && liveLocationError ? <span className="text-xs font-bold text-animeo-error">{liveLocationError}</span> : null}

            {/* Parcourir les clients localisés, dans l'ordre de la liste. */}
            <div role="group" aria-label="Parcourir les clients sur la carte" className="ml-auto flex items-center gap-1">
              <button type="button" onClick={() => goTo(-1)} disabled={orderedLocated.length === 0 || navIndex === 0} aria-label="Client précédent" className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40">
                <ChevronLeft aria-hidden="true" className="h-4 w-4" />
                <span className="hidden sm:inline">Précédent</span>
              </button>
              <span className="min-w-[4.5rem] text-center text-xs font-extrabold tabular-nums text-animeo-muted" data-testid="map-navigation-counter">
                {navIndex >= 0 ? `${navIndex + 1} / ${orderedLocated.length}` : `${orderedLocated.length} localisé${orderedLocated.length > 1 ? "s" : ""}`}
              </span>
              <button type="button" onClick={() => goTo(1)} disabled={orderedLocated.length === 0 || navIndex === orderedLocated.length - 1} aria-label="Client suivant" className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft disabled:cursor-not-allowed disabled:opacity-40">
                <span className="hidden sm:inline">Suivant</span>
                <ChevronRight aria-hidden="true" className="h-4 w-4" />
              </button>
            </div>
          </div>
          <RealMap
            points={points}
            selectedId={selectedClient?.coordinates ? selectedClient.id : undefined}
            onSelect={toggleSelection}
            onBackgroundClick={() => setSelectedId(null)}
            // ← → passent d'un client à l'autre (voir handleNavigationKeys) ;
            // la carte se déplace à la souris, au doigt, ou par les boutons.
            keyboard={false}
            // Fiche en bas à droite (large) ou en bas (étroit) : le point
            // choisi s'affiche au-dessus et à gauche, jamais dessous.
            selectedOffset={showCircleHandle ? { x: 160, y: 90 } : { x: 0, y: 120 }}
            heightClassName="h-[610px]"
            // Pas de fiche flottante pour un client sans position : rien sur
            // la carte ne lui correspond. Il se traite depuis la liste.
            overlay={selectedClient?.coordinates ? <MapClientPopup client={selectedClient} onClose={() => setSelectedId(null)} /> : undefined}
            circle={perimeterCenter ? { lat: perimeterCenter.lat, lng: perimeterCenter.lng, radiusKm: perimeterRadiusKm } : null}
            pin={perimeterCenter?.pin ? { lat: perimeterCenter.lat, lng: perimeterCenter.lng, label: perimeterCenter.label } : null}
            areas={[
              ...(communeArea ? [{ id: `commune-${communeArea.code}`, geometry: communeArea.geometry }] : []),
              ...(territory?.status === "ready" && territory.geometry ? [{ id: `${territory.type}-${territory.code}`, geometry: territory.geometry }] : []),
            ]}
            fitBounds={fitTarget}
            fitPadding={fitPadding}
            circleHandle={showCircleHandle}
            onCircleRadiusChange={handleCircleRadiusChange}
            circleHandleResetKey={circleHandleResetKey}
            defaultCenter={cabinetCoordinates ? [cabinetCoordinates.lat, cabinetCoordinates.lng] : null}
            liveLocation={liveLocation}
          />
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-6">
          <div className="border-b border-animeo-border-soft px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-extrabold text-animeo-dark">Clients visibles</h2>
                <p className="mt-0.5 text-xs text-animeo-muted">
                  {sortMode === "distance" && proximityOrigin ? `À vol d’oiseau depuis ${proximityOrigin.label}` : hasPerimeter ? "Filtrés par périmètre" : "Sélection synchronisée avec la carte"}
                </p>
              </div>
              <div role="group" aria-label="Trier la liste" className="flex shrink-0 rounded-xl bg-animeo-bg p-1">
                <button type="button" aria-pressed={sortMode === "name"} onClick={() => chooseSort("name")} className={`min-h-9 rounded-lg px-2.5 text-xs font-extrabold transition ${sortMode === "name" ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"}`}>Nom</button>
                <button
                  type="button"
                  aria-pressed={sortMode === "distance"}
                  onClick={() => chooseSort("distance")}
                  disabled={!proximityCandidate}
                  title={proximityCandidate ? `Trier par distance depuis ${proximityCandidate.label}` : "Choisissez un client, ou renseignez l’adresse de votre lieu d’exercice"}
                  className={`min-h-9 rounded-lg px-2.5 text-xs font-extrabold transition disabled:cursor-not-allowed disabled:opacity-40 ${sortMode === "distance" ? "bg-white text-animeo-dark shadow-sm" : "text-animeo-muted hover:text-animeo-dark"}`}
                >
                  Proximité
                </button>
              </div>
            </div>
          </div>
          {visibleClients.length > 0 ? (
            <div ref={listRef} data-testid="map-client-list" className="relative max-h-[650px] divide-y divide-animeo-border-soft overflow-y-auto">
              {[...orderedLocated, ...orderedUnlocated].map((client, index) => {
                const selected = selectedClient?.id === client.id;
                const distance = distanceFrom(client);
                return (
                <Fragment key={client.id}>
                {/* Les clients sans position forment une section à part : la
                    carte et « Précédent / Suivant » ne peuvent rien en montrer. */}
                {index === orderedLocated.length && orderedUnlocated.length > 0 ? (
                  <p className="bg-animeo-bg px-5 py-2 text-[11px] font-extrabold text-animeo-muted">Sans position ({orderedUnlocated.length})</p>
                ) : null}
                <div data-client-row={client.id} className={selected ? "bg-animeo-soft" : undefined}>
                <button type="button" onClick={() => toggleSelection(client.id)} aria-current={selected ? "true" : undefined} className={`flex w-full items-center gap-3 p-4 text-left transition ${selected ? "" : "hover:bg-animeo-bg"}`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm" style={{ backgroundColor: `color-mix(in srgb, ${resolveSpeciesColor(theme.speciesColors, client.species)} 18%, white)` }}>{client.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-animeo-dark">{client.ownerName}</span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-animeo-muted">{client.animalName} · {client.species}</span>
                    <span className="mt-1 block truncate text-[10px] text-animeo-muted">
                      {client.city} · {client.lastConsultation}
                      {!client.coordinates ? <span className="ml-1.5 font-bold text-animeo-danger">· Position inconnue</span> : null}
                    </span>
                  </span>
                  {distance !== null ? <span className="shrink-0 text-xs font-extrabold tabular-nums text-animeo-dark">{formatKm(distance)}</span> : null}
                  {client.dueForReminder ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-animeo-accent" title="À relancer" /> : null}
                </button>
                {selected && !client.coordinates ? <UnlocatedClientActions client={client} /> : null}
                </div>
                </Fragment>
                );
              })}
            </div>
          ) : (
            <div className="p-8 text-center"><Icon name="map" className="mx-auto h-8 w-8 text-animeo-muted" /><p className="mt-3 text-sm font-bold text-animeo-muted">Aucun client ne correspond aux filtres.</p></div>
          )}
        </Card>
      </div>

      <div className="rounded-2xl border border-animeo-soft-strong bg-animeo-soft px-4 py-3 text-xs font-semibold leading-relaxed text-animeo-dark">
        Carte OpenStreetMap avec positions réelles. Itinéraires optimisés prévus en V2.
      </div>
    </div>
  );
}

/**
 * Client choisi sans position : rien sur la carte ne lui correspond, sa
 * fiche reste dans la liste, avec de quoi le localiser à partir de son
 * adresse.
 */
function UnlocatedClientActions({ client }: { client: MapClient }) {
  const router = useRouter();
  const [locating, setLocating] = useState(false);

  async function locate() {
    setLocating(true);
    const result = await geocodeClientAddressAction(client.clientId);
    setLocating(false);
    if (!result.ok) { notify.error(result.error); return; }
    notify.success(`${client.ownerName} est localisé sur la carte.`);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 pb-4 pl-[4.75rem]">
      <p className="w-full text-xs text-animeo-muted">Position inconnue : l’adresse de la fiche n’a pas encore été localisée.</p>
      <button type="button" onClick={locate} disabled={locating} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo px-3 text-xs font-extrabold text-white transition hover:bg-animeo-hover disabled:opacity-60">
        <Icon name="map" className="h-3.5 w-3.5" />
        {locating ? "Localisation…" : "Localiser"}
      </button>
      <Link href={`/dashboard/clients/${client.clientId}`} className="inline-flex min-h-11 items-center rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
        Fiche client
      </Link>
    </div>
  );
}

function MapClientPopup({ client, onClose }: { client: MapClient; onClose: () => void }) {
  const { theme } = useDashboardTheme();
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_12px_30px_rgb(var(--theme-shadow-rgb)/0.18)] backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `color-mix(in srgb, ${resolveSpeciesColor(theme.speciesColors, client.species)} 22%, white)` }}>{client.avatar}</span>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-black text-animeo-dark">{client.ownerName}</h3>
          <p className="mt-0.5 text-xs font-extrabold text-animeo">{client.animalName}</p>
          <p className="text-[10px] font-semibold text-animeo-muted">{client.species} · {client.breed}</p>
        </div>
        <button type="button" onClick={onClose} aria-label={`Fermer la fiche de ${client.ownerName}`} className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <dl className="mt-3 space-y-1.5 text-[11px]">
        <PopupLine label="Ville" value={client.city} />
        <PopupLine label="Dernière consultation" value={client.lastConsultation} />
        <PopupLine label="Prochain rappel" value={client.nextReminder} />
      </dl>
      <Link href={`/dashboard/clients/${client.clientId}`} className="mt-4 flex w-full items-center justify-center rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-animeo-hover">Voir la fiche client</Link>
    </div>
  );
}

function PopupLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="text-right font-extrabold text-animeo-dark">{value}</dd></div>;
}

function speciesButtonLabel(selected: AnimalSpecies[]): string {
  if (selected.length === 0) return "Espèce";
  if (selected.length === 1) return selected[0];
  return `${selected.length} espèces`;
}

function ChevronIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-3.5 w-3.5 shrink-0">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}
