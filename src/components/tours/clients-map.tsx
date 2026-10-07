"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BellRing, Bookmark, CalendarClock, CalendarPlus, History, ChevronLeft, ChevronRight, CircleCheck, Crosshair, House, ListChecks, LocateFixed, MapPin, Maximize2, Minimize2, MousePointerClick, Navigation, Phone, Route, SquareDashedMousePointer, Star, Trash2, UserRound } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { UnifiedSearch, type UnifiedSearchSelection } from "@/components/search/unified-search";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { animalSpeciesList, resolveSpeciesColor } from "@/data/species";
import { circleBounds, haversineDistanceKm, pointInGeometry, type GeoBounds, type TerritoryGeometry } from "@/lib/geo";
import { geocodeClientAddressAction, locateUnlocatedClientsAction } from "@/lib/clients-actions";
import { notify } from "@/lib/notify";
import { pluralizeAnimals } from "@/lib/format";
import { toTelHref } from "@/lib/phone";
import { sendRemindersBulkAction } from "@/lib/reminders-actions";
import { hasModule } from "@/lib/modules";
import { hasCabinet, visitsHomes, type PracticeMode } from "@/lib/practice-mode";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { useAppointments } from "@/components/appointments/appointments-context";
import { ConfirmModal } from "@/components/ui/confirm-modal";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { ActionMenu } from "@/components/ui/action-menu";
import { deleteMapViewAction, saveMapViewAction } from "@/lib/map-views-actions";
import type { MapViewSummary } from "@/lib/map-views";
import type { AnimalSpecies } from "@/data/tours";
import type { MapAppointment, MapClientAnimal, MapClientSummary } from "@/data/map-clients";
import type { PublicZone } from "@/data/public-booking";
import {
  ACTIVITY_RANGES, addDaysToDateId, appointmentsInRange, mapModeParam, matchesVisitFilter, MAP_MODES, parseActivityRange, parseMapMode, parseVisitFilter,
  parseZoneFilter, positionQuality, positionQualitySummary, sanitizeMapQuery, VISIT_FILTERS, visitTier, zoneFilterParam, zoneIdsOf,
  type ActivityRange, type MapMode, type PositionQuality, type VisitFilter, type ZoneFilter,
} from "@/lib/map-modes";
import { MapBottomSheet, type SheetSnap } from "@/components/tours/map-bottom-sheet";
import type { RealMapBasemap } from "@/components/tours/real-map";
import { PrepareTourModal } from "@/components/tours/prepare-tour-modal";
import { APPOINTMENT_LEGEND, appointmentStatusColors, appointmentTitle, MapAppointmentCard, MapAppointmentList, MapModeSwitcher, Segmented, ToursPanel, type PlannedTour } from "@/components/tours/map-modes";

const RealMap = dynamic(() => import("@/components/tours/real-map").then((mod) => mod.RealMap), {
  ssr: false,
  loading: () => <div className="flex h-[min(610px,70dvh)] min-h-[340px] items-center justify-center rounded-2xl border border-animeo-border bg-animeo-positive-soft text-sm font-bold text-animeo-muted">Chargement de la carte…</div>,
});

type ClientsMapProps = {
  clients: MapClientSummary[];
  cabinetCoordinates?: { lat: number; lng: number } | null;
  /** Mode d'exercice : nom du repère (cabinet / lieu d'exercice) et lieu d'un nouveau rendez-vous. */
  practiceMode?: PracticeMode;
  /** Zones de tournée (communes, codes postaux, secteur éventuel). */
  zones?: PublicZone[];
  /** Tournées actives qui ont encore une date à venir. */
  plannedTours?: PlannedTour[];
  /** Rendez-vous d'aujourd'hui aux 30 prochains jours (mode « Activité »). */
  appointments?: MapAppointment[];
  /** Jour de référence (AAAA-MM-JJ, heure de Paris), fixé par le serveur. */
  todayId?: string;
  /** Vues enregistrées du compte (phase 8.6). */
  savedViews?: MapViewSummary[];
};

type ColorMode = "species" | "visit" | "due" | "quality";
const colorModeLabels: Record<ColorMode, string> = { species: "Espèce", visit: "Dernière visite", due: "À relancer", quality: "Qualité des positions" };

const qualityColors: Record<Exclude<PositionQuality, "unknown">, string> = { precise: "var(--theme-success)", approximate: "var(--theme-warning)" };
const qualityFilterLabels: Record<PositionQuality, string> = { precise: "Positions précises", approximate: "Positions approximatives", unknown: "Positions inconnues" };

/** Ancienneté de la dernière visite, en trois paliers (jamais la couleur seule : le libellé suit). */
function visitBucket(client: MapClientSummary, todayId: string): { color: string; label: string } {
  if (!client.lastConsultationAt) return { color: "var(--theme-danger)", label: "Jamais vu" };
  const tier = visitTier(client.lastConsultationAt, todayId);
  if (tier === "recent") return { color: "var(--theme-success)", label: "Vu il y a moins de 3 mois" };
  if (tier === "mid") return { color: "var(--theme-warning)", label: "Vu il y a 3 à 12 mois" };
  return { color: "var(--theme-danger)", label: "Pas vu depuis plus de 12 mois" };
}

const ZONE_LEGEND = [
  { color: "var(--theme-brand)", label: "Dans une zone" },
  { color: "var(--theme-subtle)", label: "Non rattaché" },
];

const mapTitles: Record<MapMode, string> = {
  clients: "Répartition des clients",
  activity: "Rendez-vous à venir",
  reminders: "Suivi des visites",
  tours: "Zones et tournées",
};

const VISIT_LEGEND = [
  { color: "var(--theme-success)", label: "Moins de 3 mois" },
  { color: "var(--theme-warning)", label: "3 à 12 mois" },
  { color: "var(--theme-danger)", label: "Plus de 12 mois ou jamais" },
];

/**
 * État de la carte gardé dans l'adresse de la page : un lien partagé ou un
 * retour arrière retrouve les mêmes filtres, le même lieu, le même client.
 */
type MapUrlState = {
  species: AnimalSpecies[];
  due: boolean;
  color: ColorMode;
  visibleOnly: boolean;
  showZones: boolean;
  center: { lat: number; lng: number; label: string; pin?: boolean; communeCode?: string } | null;
  radius: number;
  territory: { type: "departement" | "region"; code: string; label: string } | null;
  selected: string | null;
  mode: MapMode;
  range: ActivityRange;
  visit: VisitFilter;
  zone: ZoneFilter | null;
  appointment: string | null;
  basemap: RealMapBasemap;
};

function parseMapUrl(params: URLSearchParams): MapUrlState {
  const [lat, lng] = (params.get("lieu") ?? "").split(",").map(Number);
  const territoryParam = params.get("territoire")?.split(":");
  const territoryType = territoryParam?.[0];
  const color = params.get("couleur");
  return {
    species: (params.get("especes")?.split(",").filter((item) => (animalSpeciesList as readonly string[]).includes(item)) ?? []) as AnimalSpecies[],
    due: params.get("relance") === "1",
    color: color === "visit" || color === "due" || color === "quality" ? color : "species",
    visibleOnly: params.get("vue") === "visible",
    showZones: params.get("zones") === "1",
    center: Number.isFinite(lat) && Number.isFinite(lng) && params.get("lieu")
      ? { lat, lng, label: params.get("nom") ?? "ce lieu", pin: params.get("adresse") === "1" || undefined, communeCode: params.get("commune") ?? undefined }
      : null,
    radius: Math.min(200, Math.max(5, Number(params.get("rayon")) || DEFAULT_PERIMETER_RADIUS_KM)),
    territory: (territoryType === "departement" || territoryType === "region") && territoryParam?.[1]
      ? { type: territoryType, code: territoryParam[1], label: params.get("nom") ?? territoryParam[1] }
      : null,
    selected: params.get("client"),
    mode: parseMapMode(params.get("mode")),
    range: parseActivityRange(params.get("periode")),
    visit: parseVisitFilter(params.get("suivi")),
    zone: parseZoneFilter(params.get("zone")),
    appointment: params.get("rdv"),
    basemap: params.get("fond") === "aerien" ? "aerial" : "plan",
  };
}

/**
 * L'inverse de parseMapUrl : l'état de la carte écrit dans l'adresse. Sert à
 * l'adresse de la page et aux vues enregistrées — une seule écriture, pour
 * qu'une vue rouverte soit exactement la carte enregistrée.
 */
function buildMapQuery(state: {
  species: AnimalSpecies[];
  due: boolean;
  color: ColorMode;
  visibleOnly: boolean;
  showZones: boolean;
  center: PerimeterCenter | null;
  radius: number;
  territory: { type: "departement" | "region"; code: string; label: string } | null;
  selectedId: string | null;
  mode: MapMode;
  range: ActivityRange;
  appointmentId: string | null;
  visit: VisitFilter;
  zone: ZoneFilter | null;
  basemap: RealMapBasemap;
}): string {
  const params = new URLSearchParams();
  if (state.species.length) params.set("especes", state.species.join(","));
  if (state.due) params.set("relance", "1");
  if (state.color !== "species") params.set("couleur", state.color);
  if (state.visibleOnly) params.set("vue", "visible");
  if (state.showZones) params.set("zones", "1");
  // « Autour de moi » ne s'écrit jamais : la position de l'appareil reste privée.
  if (state.center && !state.center.me) {
    params.set("lieu", `${state.center.lat.toFixed(5)},${state.center.lng.toFixed(5)}`);
    params.set("nom", state.center.label);
    params.set("rayon", String(Math.round(state.radius)));
    if (state.center.communeCode) params.set("commune", state.center.communeCode);
    if (state.center.pin) params.set("adresse", "1");
  }
  if (state.territory) {
    params.set("territoire", `${state.territory.type}:${state.territory.code}`);
    params.set("nom", state.territory.label);
  }
  if (state.selectedId) params.set("client", state.selectedId);
  const modeParam = mapModeParam(state.mode);
  if (modeParam) params.set("mode", modeParam);
  if (state.mode === "activity") {
    if (state.range !== "7") params.set("periode", state.range);
    if (state.appointmentId) params.set("rdv", state.appointmentId);
  }
  if (state.mode === "reminders" && state.visit !== "all") params.set("suivi", state.visit);
  if (state.mode === "tours" && state.zone) params.set("zone", zoneFilterParam(state.zone));
  if (state.basemap === "aerial") params.set("fond", "aerien");
  return params.toString();
}

// Cercle autour d'un point : une adresse (épingle) ou une commune (contour
// affiché en plus, code INSEE pour le charger).
// `me` : le cercle « Autour de moi », centré sur la position de l'appareil
// (jamais écrite dans l'adresse de la page, ni enregistrée).
type PerimeterCenter = { lat: number; lng: number; label: string; pin?: boolean; communeCode?: string; me?: boolean };
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

type MapClient = MapClientSummary;

/** Initiales d'un client sans animal : de quoi remplir sa pastille. */
function initialsOf(name: string): string {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toLocaleUpperCase("fr-FR")).join("");
}

/**
 * L'animal qui représente un client sur la carte (couleur, pastille) : le
 * premier de l'espèce filtrée s'il y a un filtre, sinon son premier animal.
 */
function leadAnimal(client: MapClient, species: AnimalSpecies[]): MapClientAnimal | undefined {
  return client.animals.find((animal) => species.length === 0 || species.includes(animal.species)) ?? client.animals[0];
}

function animalsLine(client: MapClient): string {
  return client.animals.length ? client.animals.map((animal) => `${animal.name} · ${animal.species}`).join(", ") : "Aucun animal";
}

const positionSourceLabels = { address: "Adresse du client", appointment: "Dernier rendez-vous à domicile", place: "Lieu de l’animal" } as const;

/** Tous les emplacements localisés d'un client (domicile, lieux de ses animaux). */
function positionsOf(client: MapClientSummary): Array<{ lat: number; lng: number }> {
  return client.locations.map((location) => location.coordinates);
}

function inBounds(point: { lat: number; lng: number }, bounds: GeoBounds) {
  return point.lat >= bounds.south && point.lat <= bounds.north && point.lng >= bounds.west && point.lng <= bounds.east;
}

/** Client d'un point de la carte : « client » ou « client@lieu ». */
const clientIdOfPoint = (pointId: string) => pointId.split("@")[0];
const precisionLabels = { EXACT: "précise", STREET: "à la rue", CITY: "approximative (commune)" } as const;

/** Origine et précision d'une position, dites en clair. */
function positionLabel(client: MapClient): string | null {
  if (!client.positionSource) return null;
  const source = positionSourceLabels[client.positionSource];
  return client.precision ? `${source} · ${precisionLabels[client.precision]}` : source;
}

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
// Autour de moi : des distances de déplacement, pas de secteur.
const AROUND_ME_TIERS = [5, 10, 15, 30];
const AROUND_ME_DEFAULT_KM = 10;
// Sous cette largeur, la poignée de redimensionnement du cercle disparaît
// (tirer une poignée avec le doigt masque la carte sur mobile) : seuls les
// paliers restent.
const CIRCLE_HANDLE_MIN_WIDTH_QUERY = "(min-width: 640px)";
// Lignes de la liste affichées d'un coup ; la suite à la demande (phase 8.10).
const LIST_PAGE_SIZE = 150;
// Téléphone : carte plein écran et panneau glissant (phase 8.4).
const PHONE_QUERY = "(max-width: 639px)";
function subscribePhone(onChange: () => void) {
  const media = window.matchMedia(PHONE_QUERY);
  media.addEventListener("change", onChange);
  return () => media.removeEventListener("change", onChange);
}

export function ClientsMap({ clients, cabinetCoordinates = null, practiceMode = "BOTH", zones = [], plannedTours = [], appointments = [], todayId: todayIdProp, savedViews = [] }: ClientsMapProps) {
  const { theme } = useDashboardTheme();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Lu une seule fois : l'adresse sert d'état de départ, puis suit la carte.
  const [initialUrl] = useState(() => parseMapUrl(new URLSearchParams(searchParams.toString())));
  // Jour de référence du serveur (heure de Paris) : le même au rendu serveur
  // et dans le navigateur.
  const [todayId] = useState(() => todayIdProp ?? new Date().toISOString().slice(0, 10));
  // Une même carte, quatre questions (Clients, Activité, Relances, Tournées).
  const [mapMode, setMapMode] = useState<MapMode>(initialUrl.mode);
  const [activityRange, setActivityRange] = useState<ActivityRange>(initialUrl.range);
  const [visitFilter, setVisitFilter] = useState<VisitFilter>(initialUrl.visit);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter | null>(initialUrl.zone);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(initialUrl.appointment);
  // Rendu serveur : mise en page grand écran ; le téléphone bascule au
  // montage, sans écart d'hydratation.
  const isPhone = useSyncExternalStore(subscribePhone, () => window.matchMedia(PHONE_QUERY).matches, () => false);
  const [sheetSnap, setSheetSnap] = useState<SheetSnap>("compact");
  // Liste par pages : des milliers de lignes ne s'affichent pas d'un coup.
  const [listLimit, setListLimit] = useState(LIST_PAGE_SIZE);
  const [basemap, setBasemap] = useState<RealMapBasemap>(initialUrl.basemap);
  // Fiche du lieu d'exercice (phase 8.12), ouverte depuis son repère.
  const [practiceOpen, setPracticeOpen] = useState(false);
  // Sélection multiple (phase 8.5) : des clients choisis ensemble pour une
  // action groupée — distincte de la fiche ouverte (un seul client).
  const [marked, setMarked] = useState<string[]>([]);
  const [areaTool, setAreaTool] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  // Clients d'une journée à préparer (sélection, ou suggestion d'un secteur).
  const [preparingTourIds, setPreparingTourIds] = useState<string[] | null>(null);
  const toolsRef = useRef<HTMLDivElement>(null);
  // Mes vues (phase 8.6) : cadrages enregistrés du compte.
  const [views, setViews] = useState<MapViewSummary[]>(savedViews);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [savingView, setSavingView] = useState(false);
  const [viewToDelete, setViewToDelete] = useState<MapViewSummary | null>(null);
  // Qualité des positions (phase 8.7) : filtre et détail de l'indicateur.
  const [qualityFilter, setQualityFilter] = useState<PositionQuality | null>(null);
  const [qualityOpen, setQualityOpen] = useState(false);
  const qualityRef = useRef<HTMLDivElement>(null);
  const viewsRef = useRef<HTMLDivElement>(null);
  const [selectedSpecies, setSelectedSpecies] = useState<AnimalSpecies[]>(initialUrl.species);
  const [speciesPanelOpen, setSpeciesPanelOpen] = useState(false);
  const [dueOnly, setDueOnly] = useState(initialUrl.due);
  const [colorMode, setColorMode] = useState<ColorMode>(initialUrl.color);
  // Liste limitée à ce que montre la carte, mise à jour à chaque déplacement.
  const [visibleOnly, setVisibleOnly] = useState(initialUrl.visibleOnly);
  const [mapBounds, setMapBounds] = useState<GeoBounds | null>(null);
  const [showZones, setShowZones] = useState(initialUrl.showZones);
  // Survol synchronisé liste ↔ carte (halo, ligne en surbrillance), sans
  // jamais déplacer la carte.
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const mapCardRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [query, setQuery] = useState("");
  // Aucune sélection à l'arrivée : la carte montre d'abord toute la
  // clientèle. Une fiche ne s'ouvre qu'à un geste (marqueur, liste, recherche).
  const [selectedId, setSelectedId] = useState<string | null>(initialUrl.selected);
  // Emplacement choisi du client (domicile ou lieu d'un animal) : c'est lui
  // que la carte montre et dont la fiche donne l'itinéraire.
  const [selectedLocationKey, setSelectedLocationKey] = useState<string | null>(null);
  // Tri de la liste et ordre de « Précédent / Suivant ». Proximité : depuis
  // le client choisi au moment du tri, sinon le lieu d'exercice — un point
  // fixe, pour que l'ordre ne bouge pas à chaque client parcouru.
  const [sortMode, setSortMode] = useState<SortMode>("name");
  const [proximityOrigin, setProximityOrigin] = useState<ProximityOrigin | null>(null);
  // Autour de moi : la position n'est demandée qu'à un geste explicite, une
  // seule fois (pas de suivi continu : la carte ne bouge jamais d'elle-même).
  // « Recentrer sur moi » la redemande.
  const [myPosition, setMyPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [positionError, setPositionError] = useState<"denied" | "unavailable" | null>(null);

  const [perimeterCenter, setPerimeterCenter] = useState<PerimeterCenter | null>(initialUrl.center);
  const [territory, setTerritory] = useState<TerritoryPerimeter | null>(initialUrl.territory ? { ...initialUrl.territory, status: "loading" } : null);
  // Contour de la commune choisie : affiché autour du cercle, sans filtrer.
  const [communeArea, setCommuneArea] = useState<{ code: string; geometry: TerritoryGeometry } | null>(null);
  // Chaque nouveau lieu invalide les chargements en cours du précédent.
  const placeRequestRef = useRef(0);
  // Recadrage demandé à la carte (cercle, territoire, tous les clients).
  const [fitTarget, setFitTarget] = useState<(GeoBounds & { token: string }) | null>(
    () => (initialUrl.center ? { ...circleBounds(initialUrl.center, initialUrl.radius), token: "url" } : null),
  );
  const fitTokenRef = useRef(0);
  const [perimeterRadiusKm, setPerimeterRadiusKm] = useState(initialUrl.radius);
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

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (viewsRef.current && !viewsRef.current.contains(event.target as Node)) setViewsOpen(false);
      if (qualityRef.current && !qualityRef.current.contains(event.target as Node)) setQualityOpen(false);
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

  function locateMe() {
    if (typeof navigator === "undefined" || !navigator.geolocation) { setPositionError("unavailable"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (result) => {
        const position = { lat: result.coords.latitude, lng: result.coords.longitude };
        const radius = perimeterCenter?.me ? perimeterRadiusKm : AROUND_ME_DEFAULT_KM;
        placeRequestRef.current += 1;
        setLocating(false);
        setPositionError(null);
        setMyPosition(position);
        setTerritory(null);
        setCommuneArea(null);
        setPerimeterCenter({ ...position, label: "vous", me: true });
        setPerimeterRadiusKm(radius);
        setCircleHandleResetKey((current) => current + 1);
        setProximityOrigin({ ...position, label: "votre position" });
        setSortMode("distance");
        fitTo(circleBounds(position, radius));
      },
      (error) => {
        setLocating(false);
        setPositionError(error.code === error.PERMISSION_DENIED ? "denied" : "unavailable");
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    );
  }

  function clearAllFilters() {
    setQualityFilter(null);
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

  // Zones qui couvrent chaque client (mode « Tournées ») : même règle que
  // la réservation en ligne.
  const zoneIdsByClient = useMemo(() => new Map(clients.map((client) => [client.id, zoneIdsOf(client, zones)])), [clients, zones]);
  const zoneCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ids of zoneIdsByClient.values()) for (const id of ids) counts[id] = (counts[id] ?? 0) + 1;
    return counts;
  }, [zoneIdsByClient]);
  const unattachedCount = clients.filter((client) => (zoneIdsByClient.get(client.id) ?? []).length === 0).length;
  const sectorZones = zones.flatMap((zone) => (zone.sector ? [{ id: zone.id, name: zone.name, ...zone.sector }] : []));

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    const zoneFilterIds = zoneFilter?.kind === "zone" ? [zoneFilter.id]
      : zoneFilter?.kind === "tour" ? plannedTours.find((tour) => tour.id === zoneFilter.id)?.zoneIds ?? []
        : [];
    return clients.filter((client) => {
      const matchesSpecies = selectedSpecies.length === 0 || client.animals.some((animal) => selectedSpecies.includes(animal.species));
      // Relances : le suivi choisi (à relancer, ancienneté) ; ailleurs, la bascule « À relancer ».
      const matchesReminder = mapMode === "reminders" ? matchesVisitFilter(client, visitFilter, todayId) : !dueOnly || client.dueForReminder;
      const matchesQuery = !normalizedQuery || `${client.ownerName} ${client.animals.map((animal) => animal.name).join(" ")}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      const clientZones = zoneIdsByClient.get(client.id) ?? [];
      const matchesZone = mapMode !== "tours" || !zoneFilter
        || (zoneFilter.kind === "none" ? clientZones.length === 0 : clientZones.some((id) => zoneFilterIds.includes(id)));
      const matchesQuality = !qualityFilter || positionQuality(client) === qualityFilter;
      return matchesSpecies && matchesReminder && matchesQuery && matchesZone && matchesQuality;
    });
  }, [clients, dueOnly, query, selectedSpecies, mapMode, visitFilter, todayId, zoneIdsByClient, zoneFilter, plannedTours, qualityFilter]);
  // Toute la clientèle, pas seulement ce qui est filtré : l'indicateur dit
  // la fiabilité de la carte elle-même.
  const qualitySummary = useMemo(() => positionQualitySummary(clients), [clients]);

  // Retirer le périmètre : cercle, épingle, contour et filtre partent, et la
  // carte revient sur l'ensemble des clients.
  function clearPerimeter() {
    placeRequestRef.current += 1;
    if (perimeterCenter?.me) {
      setMyPosition(null);
      setSortMode("name");
    }
    setPerimeterCenter(null);
    setTerritory(null);
    setCommuneArea(null);
    setRadiusPanelOpen(false);
    const located = filteredClients.flatMap(positionsOf);
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
      return filteredClients.filter((client) => positionsOf(client).some((point) => pointInGeometry(point, geometry)));
    }
    if (!perimeterCenter) return filteredClients;
    // Un client sans coordonnées ne peut pas être comparé à un centre de
    // périmètre : exclu plutôt que deviné.
    return filteredClients.filter((client) => positionsOf(client).some((point) => haversineDistanceKm(perimeterCenter, point) <= perimeterRadiusKm));
  }, [filteredClients, perimeterCenter, perimeterRadiusKm, territory]);

  // Nombre de clients par palier, calculé localement sur les clients déjà
  // chargés (jamais un aller-retour réseau) : affiché dans le panneau de
  // rayon, indépendant de la valeur actuellement retenue.
  const radiusTiers = perimeterCenter?.me ? AROUND_ME_TIERS : PERIMETER_RADIUS_TIERS;
  const perimeterTierCounts = useMemo(() => {
    if (!perimeterCenter) return {} as Record<number, number>;
    const counts: Record<number, number> = {};
    for (const km of perimeterCenter.me ? AROUND_ME_TIERS : PERIMETER_RADIUS_TIERS) {
      counts[km] = filteredClients.filter((client) => positionsOf(client).some((point) => haversineDistanceKm(perimeterCenter, point) <= km)).length;
    }
    return counts;
  }, [filteredClients, perimeterCenter]);

  // Clients sans coordonnées : exclus de tout calcul de périmètre, jamais
  // devinés — signalés explicitement plutôt que silencieusement absents.
  const unlocatedFilteredCount = useMemo(() => filteredClients.filter((client) => !client.coordinates).length, [filteredClients]);

  const hasPerimeter = Boolean(perimeterCenter || territory);
  const perimeterClients = hasPerimeter ? clientsInPerimeter : filteredClients;
  // « Uniquement cette zone » : la liste suit l'emprise de la carte.
  const visibleClients = visibleOnly && mapBounds
    ? perimeterClients.filter((client) => positionsOf(client).some((point) => inBounds(point, mapBounds)))
    : perimeterClients;
  const locatedClients = visibleClients.filter((client) => client.coordinates);
  const selectedClient = mapMode !== "activity" && selectedId ? visibleClients.find((client) => client.id === selectedId) ?? null : null;
  const selectedLocation = selectedClient
    ? selectedClient.locations.find((location) => location.key === selectedLocationKey) ?? selectedClient.locations[0] ?? null
    : null;

  // Mode « Activité » : les rendez-vous de la période, avec les mêmes filtres
  // (espèce, recherche, périmètre, zone affichée).
  const inPerimeter = (point: { lat: number; lng: number } | null) => {
    if (territory) return territory.status !== "ready" || !territory.geometry ? true : Boolean(point && pointInGeometry(point, territory.geometry));
    if (perimeterCenter) return Boolean(point && haversineDistanceKm(perimeterCenter, point) <= perimeterRadiusKm);
    return true;
  };
  const inView = (point: { lat: number; lng: number } | null) => !visibleOnly || !mapBounds
    || Boolean(point && point.lat >= mapBounds.south && point.lat <= mapBounds.north && point.lng >= mapBounds.west && point.lng <= mapBounds.east);
  const normalizedActivityQuery = query.trim().toLocaleLowerCase("fr-FR");
  const activityAppointments = mapMode === "activity"
    ? appointmentsInRange(appointments, todayId, activityRange).filter((appointment) =>
      (selectedSpecies.length === 0 || (appointment.animalSpecies !== null && selectedSpecies.includes(appointment.animalSpecies)))
      && (!normalizedActivityQuery || `${appointment.clientName} ${appointment.animalName}`.toLocaleLowerCase("fr-FR").includes(normalizedActivityQuery))
      && (!hasPerimeter || inPerimeter(appointment.coordinates))
      && inView(appointment.coordinates))
    : [];
  const selectedAppointment = mapMode === "activity" && selectedAppointmentId ? activityAppointments.find((appointment) => appointment.id === selectedAppointmentId) ?? null : null;
  if (selectedAppointmentId !== null && mapMode === "activity" && !selectedAppointment) setSelectedAppointmentId(null);
  const homeAppointmentCount = activityAppointments.filter((appointment) => appointment.place === "home").length;

  const distanceFrom = (client: MapClient) => (sortMode === "distance" && proximityOrigin && client.coordinates ? haversineDistanceKm(proximityOrigin, client.coordinates) : null);
  const byName = (a: MapClient, b: MapClient) => nameCollator.compare(a.ownerName, b.ownerName) || nameCollator.compare(a.city, b.city);
  // Clients localisés, dans l'ordre de la liste : c'est aussi l'ordre de
  // « Précédent / Suivant ». Les clients sans position suivent à part.
  const orderedLocated = [...locatedClients].sort((a, b) => {
    const da = distanceFrom(a);
    const db = distanceFrom(b);
    return da !== null && db !== null ? da - db || byName(a, b) : byName(a, b);
  });
  const orderedUnlocated = visibleClients.filter((client) => !client.coordinates).sort(byName);
  const navIndex = selectedClient?.coordinates ? orderedLocated.findIndex((client) => client.id === selectedClient.id) : -1;
  const orderedClients = [...orderedLocated, ...orderedUnlocated];
  // Le client choisi (marqueur, recherche, Suivant) est toujours affiché.
  const selectedListIndex = selectedClient ? orderedClients.findIndex((client) => client.id === selectedClient.id) : -1;
  const shownCount = Math.max(listLimit, selectedListIndex + 1);

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
  if (selectedId !== null && mapMode !== "activity" && !selectedClient) setSelectedId(null);

  // Changer de mode referme la fiche ouverte : un client et un rendez-vous
  // ne se confondent pas.
  function changeMode(next: MapMode) {
    setMapMode(next);
    setSelectedId(null);
    setSelectedAppointmentId(null);
    setHoveredId(null);
    clearMarked();
  }

  function clearMarked() {
    setMarked([]);
    setAreaTool(false);
    setSelectMode(false);
  }

  function toggleMarked(id: string) {
    setMarked((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  }

  function addMarked(ids: string[]) {
    setMarked((current) => [...current, ...ids.filter((id) => !current.includes(id))]);
  }

  // Ctrl / ⌘ + clic, ou le mode sélection, ajoutent à la sélection au lieu
  // d'ouvrir la fiche.
  function handleClientPick(pointId: string, additive: boolean) {
    if (additive || selectMode) toggleMarked(clientIdOfPoint(pointId));
    else toggleSelection(pointId);
  }

  function selectVisibleClients() {
    const inside = (point: { lat: number; lng: number }) => !mapBounds
      || (point.lat >= mapBounds.south && point.lat <= mapBounds.north && point.lng >= mapBounds.west && point.lng <= mapBounds.east);
    addMarked(perimeterClients.filter((client) => positionsOf(client).some(inside)).map((client) => client.id));
    setToolsOpen(false);
  }

  function selectArea(bounds: GeoBounds) {
    addMarked(perimeterClients.filter((client) => positionsOf(client).some((point) => inBounds(point, bounds))).map((client) => client.id));
    setAreaTool(false);
  }

  function toggleAppointment(id: string) {
    setPracticeOpen(false);
    setSelectedAppointmentId((current) => (current === id ? null : id));
    setSheetSnap((current) => (current === "full" ? "mid" : current));
  }

  // Choisir une zone ou une tournée recadre sur leurs secteurs (quand elles
  // en ont : une zone décrite par ses communes n'a pas de contour).
  function chooseZoneFilter(next: ZoneFilter | null) {
    setZoneFilter(next);
    setSelectedId(null);
    const ids = next?.kind === "zone" ? [next.id] : next?.kind === "tour" ? plannedTours.find((tour) => tour.id === next.id)?.zoneIds ?? [] : [];
    const sectors = zones.filter((zone) => ids.includes(zone.id) && zone.sector).map((zone) => circleBounds(zone.sector!, zone.sector!.radiusKm));
    if (sectors.length > 0) {
      fitTo({
        south: Math.min(...sectors.map((bounds) => bounds.south)),
        north: Math.max(...sectors.map((bounds) => bounds.north)),
        west: Math.min(...sectors.map((bounds) => bounds.west)),
        east: Math.max(...sectors.map((bounds) => bounds.east)),
      });
    }
  }

  // Même geste pour sélectionner et désélectionner : un second clic sur le
  // client déjà choisi (marqueur ou ligne) referme sa fiche.
  function toggleSelection(pointId: string) {
    setPracticeOpen(false);
    const id = clientIdOfPoint(pointId);
    // Un point du même client mais à un autre endroit : on passe à cet
    // endroit ; le même point : on referme.
    const sameClient = selectedId === id;
    const samePoint = sameClient && (selectedLocationKey ?? id) === pointId;
    setSelectedLocationKey(pointId);
    setSelectedId(samePoint ? null : id);
    setSheetSnap((current) => (current === "full" ? "mid" : current));
  }

  useEffect(() => {
    if (!areaTool) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setAreaTool(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [areaTool]);

  // Échap referme la fiche — sauf dans un champ, où Échap appartient au champ.
  useEffect(() => {
    if (!selectedId && !selectedAppointmentId && !practiceOpen) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      const target = event.target as HTMLElement | null;
      if (target && (target.closest("input, textarea, select, [contenteditable='true']"))) return;
      setSelectedId(null);
      setSelectedAppointmentId(null);
      setPracticeOpen(false);
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [selectedId, selectedAppointmentId, practiceOpen]);

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
  const insidePerimeter = useMemo(() => new Set(perimeterClients.map((client) => client.id)), [perimeterClients]);
  const markedSet = useMemo(() => new Set(marked), [marked]);
  const markedClients = clients.filter((client) => markedSet.has(client.id));
  const markedLocatedCount = markedClients.filter((client) => client.coordinates).length;
  const markedDue = markedClients.filter((client) => client.dueReminderIds.length > 0);
  // Couleur des points : au choix en mode Clients ; imposée par la question
  // posée dans les autres modes.
  const effectiveColor = mapMode === "reminders" ? "visit" : colorMode;
  // Mis en cache : un survol ou une saisie ne doit pas recalculer des
  // milliers de points ni reconstruire l'index des pastilles (phase 8.10).
  const clientPoints = useMemo(() => filteredClients.flatMap((client) => client.locations.map((location) => ({ client, location }))).map(({ client, location }) => {
    const outside = hasPerimeter && !insidePerimeter.has(client.id);
    // Chaque point montre les animaux qui vivent à cet endroit (domicile ou
    // lieu) ; un client sans animal garde son point au domicile.
    const here = location.animalIds.length ? { ...client, animals: client.animals.filter((animal) => location.animalIds.includes(animal.id)) } : client;
    const lead = leadAnimal(here, selectedSpecies) ?? leadAnimal(client, selectedSpecies);
    const clientZones = zoneIdsByClient.get(client.id) ?? [];
    const quality = positionQuality(client);
    const zoneLabel = clientZones.length ? ` · ${clientZones.map((id) => zones.find((zone) => zone.id === id)?.name).join(", ")}` : " · non rattaché";
    return {
      id: location.key,
      lat: location.coordinates.lat,
      lng: location.coordinates.lng,
      label: lead?.avatar || initialsOf(client.ownerName),
      title: `${client.ownerName} · ${animalsLine(here)} · ${location.placeName ? `au ${location.placeName}, ${location.city}` : client.city}${client.dueForReminder ? " · À relancer" : ""}${effectiveColor === "visit" && mapMode !== "tours" ? ` · ${visitBucket(client, todayId).label.toLowerCase()}` : ""}${mapMode === "tours" ? zoneLabel : ""}${effectiveColor === "quality" && mapMode !== "tours" ? ` · position ${quality === "precise" ? "précise" : "approximative"}` : ""}${outside ? " · hors du périmètre" : ""}`,
      color: mapMode === "tours" ? (clientZones.length ? "var(--theme-brand)" : "var(--theme-subtle)")
        : effectiveColor === "quality" ? qualityColors[quality === "precise" ? "precise" : "approximate"]
        : effectiveColor === "visit" ? visitBucket(client, todayId).color
          : effectiveColor === "due" ? (client.dueForReminder ? "var(--theme-brand)" : "var(--theme-subtle)")
            : lead ? resolveSpeciesColor(theme.speciesColors, lead.species) : "var(--theme-brand)",
      badge: client.dueForReminder,
      flagged: client.dueForReminder,
      dimmed: outside,
      marked: markedSet.has(client.id),
      approximate: effectiveColor === "quality" && mapMode !== "tours" && quality === "approximate",
    };
  }), [filteredClients, hasPerimeter, insidePerimeter, selectedSpecies, zoneIdsByClient, zones, effectiveColor, mapMode, todayId, theme.speciesColors, markedSet]);
  const appointmentPoints = activityAppointments.filter((appointment) => appointment.coordinates).map((appointment) => ({
    id: appointment.id,
    lat: appointment.coordinates!.lat,
    lng: appointment.coordinates!.lng,
    label: initialsOf(appointment.clientName),
    title: appointmentTitle(appointment, todayId),
    color: appointmentStatusColors[appointment.status],
  }));
  const points = mapMode === "activity" ? appointmentPoints : clientPoints;

  // Marges du recadrage : la fiche ouverte occupe le bas à droite (large) ou
  // le bas de la carte (étroit) — le cercle doit rester visible à côté.
  // (Sur téléphone, la fiche passe sous la carte : aucune marge à prévoir.)
  const fitPadding = (selectedClient?.coordinates || practiceOpen) && showCircleHandle
    ? { topLeft: [40, 40] as [number, number], bottomRight: [340, 40] as [number, number] }
    : undefined;
  const animalCount = visibleClients.reduce((sum, client) => sum + client.animals.length, 0);
  // Clients à relancer dans le périmètre (action groupée, 7.9).
  const dueInPerimeter = hasPerimeter ? perimeterClients.filter((client) => client.dueReminderIds.length > 0) : [];
  // Informations d'un secteur (phase 8.8) : des comptes, des règles dites en
  // clair, jamais un score. Au plus trois, plus une suggestion de tournée.
  const notSeenInPerimeter = hasPerimeter ? perimeterClients.filter((client) => visitTier(client.lastConsultationAt, todayId) === "old") : [];
  const dueReminderCount = dueInPerimeter.reduce((sum, client) => sum + client.dueReminderIds.length, 0);
  const homeAppointmentsInPerimeter = hasPerimeter
    ? appointmentsInRange(appointments, todayId, "7").filter((appointment) => appointment.place === "home" && appointment.coordinates && inPerimeter(appointment.coordinates))
    : [];
  // Regroupés : au moins trois clients à relancer dans le même périmètre.
  const tourSuggestion = dueInPerimeter.filter((client) => client.coordinates).length >= 3 ? dueInPerimeter.filter((client) => client.coordinates) : [];
  const practiceLabel = hasCabinet(practiceMode) ? "Mon cabinet" : "Mon lieu d’exercice";
  // Légende des espèces : seulement celles des points affichés, avec leur
  // nombre (la couleur d'un point est celle de l'espèce de son animal
  // principal). Les plus nombreuses d'abord, les autres regroupées.
  const speciesLegend = useMemo(() => {
    const counts = new Map<AnimalSpecies, number>();
    for (const client of perimeterClients) {
      if (!client.coordinates) continue;
      const lead = leadAnimal(client, selectedSpecies);
      if (lead) counts.set(lead.species, (counts.get(lead.species) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [perimeterClients, selectedSpecies]);
  // Ce qu'enregistrerait « Enregistrer cette vue » : l'adresse, sans le
  // client ni le rendez-vous ouverts.
  const viewQuery = sanitizeMapQuery(buildMapQuery({
    species: selectedSpecies, due: dueOnly, color: colorMode, visibleOnly, showZones, center: perimeterCenter, radius: perimeterRadiusKm,
    territory, selectedId: null, mode: mapMode, range: activityRange, appointmentId: null, visit: visitFilter, zone: zoneFilter, basemap,
  }));
  const activeView = views.find((view) => view.query === viewQuery) ?? null;
  // Clients autour du lieu d'exercice, par palier : toute la clientèle
  // localisée, à vol d'oiseau.
  const practiceTierCounts = useMemo(() => {
    if (!cabinetCoordinates) return [];
    return PERIMETER_RADIUS_TIERS.map((km) => ({ km, count: clients.filter((client) => positionsOf(client).some((point) => haversineDistanceKm(cabinetCoordinates, point) <= km)).length }));
  }, [clients, cabinetCoordinates]);
  const practicePerimeterLabel = hasCabinet(practiceMode) ? "votre cabinet" : "votre lieu d’exercice";
  const practiceDistanceOrigin = cabinetCoordinates ? { ...cabinetCoordinates, from: hasCabinet(practiceMode) ? "du cabinet" : "du lieu d’exercice" } : null;

  function boundsOf(list: MapClientSummary[]): GeoBounds | null {
    const located = list.flatMap(positionsOf);
    if (located.length === 0) return null;
    return {
      south: Math.min(...located.map((point) => point.lat)),
      north: Math.max(...located.map((point) => point.lat)),
      west: Math.min(...located.map((point) => point.lng)),
      east: Math.max(...located.map((point) => point.lng)),
    };
  }

  function recenter() {
    if (territory?.bounds) { fitTo(territory.bounds); return; }
    if (perimeterCenter) { fitTo(circleBounds(perimeterCenter, perimeterRadiusKm)); return; }
    const bounds = boundsOf(perimeterClients);
    if (bounds) fitTo(bounds);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void mapCardRef.current?.requestFullscreen?.();
  }

  useEffect(() => {
    const onChange = () => setFullscreen(document.fullscreenElement === mapCardRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Lieu ou territoire venus de l'adresse : leurs contours se chargent au
  // départ (un nouveau lieu choisi ensuite annule ces chargements).
  function loadPlaceContours(state: MapUrlState, requestId: number) {
    const code = state.center?.communeCode;
    if (code) void fetchTerritory("commune", code).then((loaded) => {
      if (loaded && placeRequestRef.current === requestId) setCommuneArea({ code, geometry: loaded.geometry });
    });
    const fromState = state.territory;
    if (fromState) void fetchTerritory(fromState.type, fromState.code).then((loaded) => {
      if (placeRequestRef.current !== requestId) return;
      if (!loaded) { setTerritory({ ...fromState, status: "error" }); return; }
      setTerritory({ ...fromState, status: "ready", geometry: loaded.geometry, bounds: loaded.bounds });
      fitTo(loaded.bounds);
    });
  }

  useEffect(() => {
    loadPlaceContours(initialUrl, 0);
    // Une seule fois, au départ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Rouvrir une vue enregistrée (ou « Tous mes clients », la vue vide) :
  // tout l'état de la carte est remplacé, rien ne reste de la précédente.
  function applyMapQuery(query: string) {
    const state = parseMapUrl(new URLSearchParams(query));
    placeRequestRef.current += 1;
    const requestId = placeRequestRef.current;
    setSelectedSpecies(state.species);
    setDueOnly(state.due);
    setColorMode(state.color);
    setVisibleOnly(state.visibleOnly);
    setShowZones(state.showZones);
    setMapMode(state.mode);
    setActivityRange(state.range);
    setVisitFilter(state.visit);
    setZoneFilter(state.zone);
    setBasemap(state.basemap);
    setSelectedId(null);
    setSelectedAppointmentId(null);
    clearMarked();
    setMyPosition(null);
    setPositionError(null);
    setSortMode("name");
    setQuery("");
    setCommuneArea(null);
    setPerimeterCenter(state.center);
    setPerimeterRadiusKm(state.radius);
    setCircleHandleResetKey((current) => current + 1);
    setTerritory(state.territory ? { ...state.territory, status: "loading" } : null);
    if (state.center) fitTo(circleBounds(state.center, state.radius));
    else if (!state.territory) {
      const bounds = boundsOf(clients);
      if (bounds) fitTo(bounds);
    }
    loadPlaceContours(state, requestId);
    setViewsOpen(false);
  }

  async function saveView(name: string): Promise<boolean> {
    const result = await saveMapViewAction({ name, query: viewQuery });
    if (!result.ok) {
      notify.error(result.error);
      return false;
    }
    setViews((current) => [...current.filter((view) => view.id !== result.view.id), result.view].sort((a, b) => nameCollator.compare(a.name, b.name)));
    notify.success(result.replaced ? `Vue « ${result.view.name} » mise à jour.` : `Vue « ${result.view.name} » enregistrée.`);
    return true;
  }

  async function deleteView(view: MapViewSummary) {
    setViewToDelete(null);
    const result = await deleteMapViewAction(view.id);
    if (!result.ok) { notify.error("La vue n’a pas pu être supprimée."); return; }
    setViews((current) => current.filter((item) => item.id !== view.id));
    notify.success(`Vue « ${view.name} » supprimée.`);
  }

  // L'adresse suit la carte : history.replaceState (pas d'entrée d'historique
  // par clic, et surtout pas de rechargement serveur qui reconstruirait les
  // marqueurs), avec un court délai pour ne pas réécrire pendant un glisser.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = buildMapQuery({
        species: selectedSpecies, due: dueOnly, color: colorMode, visibleOnly, showZones, center: perimeterCenter, radius: perimeterRadiusKm,
        territory, selectedId, mode: mapMode, range: activityRange, appointmentId: selectedAppointmentId, visit: visitFilter, zone: zoneFilter, basemap,
      });
      if (next !== window.location.search.replace(/^\?/, "")) window.history.replaceState(window.history.state, "", next ? `${pathname}?${next}` : pathname);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [selectedSpecies, dueOnly, colorMode, visibleOnly, showZones, perimeterCenter, perimeterRadiusKm, territory, selectedId, pathname, mapMode, activityRange, selectedAppointmentId, visitFilter, zoneFilter, basemap]);

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
      ? clients.find((client) => client.id === selection.client.id)
      : clients.find((client) => client.animals.some((animal) => animal.id === selection.animal.id));
    if (!target) return;
    if (mapMode === "activity") changeMode("clients");
    setSelectedId(target.id);
  }

  // Filtres actifs seulement : les filtres inactifs se rangent (bouton
  // Espèce, champ de recherche), ceux-ci restent visibles pour qu'un
  // résultat filtré reste toujours explicable en un coup d'œil. Le
  // périmètre a son propre jeton (déroulant vers les paliers) rendu à part
  // ci-dessous, pas dans cette liste générique "clic = retire".
  const activeFilterTokens: FilterToken[] = [
    ...selectedSpecies.map((species): FilterToken => ({ key: `species-${species}`, label: species, onRemove: () => toggleSpecies(species) })),
    ...(dueOnly && (mapMode === "clients" || mapMode === "tours") ? [{ key: "due", label: "À relancer", onRemove: () => setDueOnly(false) }] : []),
    ...(qualityFilter ? [{ key: "quality", label: qualityFilterLabels[qualityFilter], onRemove: () => setQualityFilter(null) }] : []),
  ];

  // Liste vide : dire pourquoi, et proposer le geste utile (élargir).
  const tierAbove = (perimeterCenter?.me ? AROUND_ME_TIERS : PERIMETER_RADIUS_TIERS).filter((km) => km > perimeterRadiusKm);
  const emptyList: { title: string; detail?: string; widen?: number[] } =
    perimeterCenter && clientsInPerimeter.length === 0
      ? {
        title: `Aucun client à moins de ${Math.round(perimeterRadiusKm)} km ${perimeterCenter.me ? "de vous" : `de ${perimeterCenter.label}`}`,
        detail: tierAbove.length ? "Essayez d’élargir la zone." : undefined,
        widen: tierAbove.slice(0, 2),
      }
      : (mapMode === "reminders" && visitFilter === "due") || (mapMode !== "reminders" && dueOnly)
        ? { title: hasPerimeter ? "Aucun client à relancer dans cette zone" : "Aucun client à relancer" }
        : { title: "Aucun client ne correspond aux filtres." };

  // Liste de la carte (clients ou rendez-vous) : dans la colonne de droite
  // sur grand écran, dans le panneau glissant sur téléphone.
  const listPanel = (
    <>
      {mapMode === "activity" ? (
        <>
          <div className="border-b border-animeo-border-soft px-5 py-4">
            <h2 className="font-extrabold text-animeo-dark">Rendez-vous</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">
              {homeAppointmentCount} à domicile · {activityAppointments.length - homeAppointmentCount} au cabinet{hasPerimeter ? " · dans le périmètre" : ""}
            </p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-extrabold text-animeo-dark">
              <input type="checkbox" checked={visibleOnly} onChange={(event) => setVisibleOnly(event.target.checked)} className="h-4 w-4 rounded border-animeo-border text-animeo focus:ring-animeo" />
              Uniquement cette zone
            </label>
          </div>
          <MapAppointmentList appointments={activityAppointments} todayId={todayId} selectedId={selectedAppointmentId} onSelect={toggleAppointment} hoveredId={hoveredId} onHover={setHoveredId} contained={!isPhone} />
        </>
      ) : (
      <>
      {mapMode === "tours" ? (
        <ToursPanel zones={zones} plannedTours={plannedTours} zoneCounts={zoneCounts} unattachedCount={unattachedCount} totalCount={clients.length} filter={zoneFilter} onFilter={chooseZoneFilter} />
      ) : null}
      <div className="border-b border-animeo-border-soft px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-extrabold text-animeo-dark">{mapMode === "reminders" ? "Clients à revoir" : mapMode === "tours" && zoneFilter ? "Clients de la sélection" : "Clients visibles"}</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">
              {sortMode === "distance" && proximityOrigin ? `À vol d’oiseau depuis ${proximityOrigin.label}` : hasPerimeter ? "Filtrés par périmètre" : "Sélection synchronisée avec la carte"}
            </p>
            <label className="mt-2 inline-flex cursor-pointer items-center gap-2 text-xs font-extrabold text-animeo-dark">
              <input type="checkbox" checked={visibleOnly} onChange={(event) => setVisibleOnly(event.target.checked)} className="h-4 w-4 rounded border-animeo-border text-animeo focus:ring-animeo" />
              Uniquement cette zone
            </label>
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
        <div ref={listRef} data-testid="map-client-list" className={`relative divide-y divide-animeo-border-soft ${isPhone ? "" : "max-h-[650px] overflow-y-auto"}`}>
          {orderedClients.slice(0, shownCount).map((client, index) => {
            const selected = selectedClient?.id === client.id;
            const distance = distanceFrom(client);
            return (
            <Fragment key={client.id}>
            {/* Les clients sans position forment une section à part : la
                carte et « Précédent / Suivant » ne peuvent rien en montrer. */}
            {index === orderedLocated.length && orderedUnlocated.length > 0 ? (
              <p className="flex items-center justify-between gap-3 bg-animeo-bg px-5 py-2 text-xs font-extrabold text-animeo-muted">
                Sans position ({orderedUnlocated.length})
                <LocateAllButton />
              </p>
            ) : null}
            <div
              data-client-row={client.id}
              onMouseEnter={() => setHoveredId(client.id)}
              onMouseLeave={() => setHoveredId((current) => (current === client.id ? null : current))}
              className={selected ? "bg-animeo-soft" : hoveredId === client.id ? "bg-animeo-bg" : undefined}
            >
            <button type="button" onClick={(event) => handleClientPick(client.id, event.ctrlKey || event.metaKey)} aria-current={selected ? "true" : undefined} className={`flex w-full items-center gap-3 p-4 text-left transition ${selected ? "" : "hover:bg-animeo-bg"}`}>
              <ClientBadge client={client} species={selectedSpecies} tint={18} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-extrabold text-animeo-dark">{client.ownerName}</span>
                <span className="mt-0.5 block truncate text-xs font-bold text-animeo-muted">{animalsLine(client)}</span>
                <span className="mt-1 block truncate text-xs text-animeo-muted">
                  {client.city} · {mapMode === "reminders" ? `Dernière visite : ${client.lastConsultation}` : client.lastConsultation}
                  {!client.coordinates ? <span className="ml-1.5 font-bold text-animeo-danger">· Position inconnue</span> : null}
                  {client.coordinates && positionQuality(client) === "approximate" ? <span className="ml-1.5 font-bold text-animeo-warning">· Position approximative</span> : null}
                </span>
              </span>
              {markedSet.has(client.id) ? <CircleCheck role="img" aria-label="Dans la sélection" className="h-5 w-5 shrink-0 text-animeo-dark" /> : null}
              {distance !== null ? <span className="shrink-0 text-xs font-extrabold tabular-nums text-animeo-dark">{formatKm(distance)}</span> : null}
              {client.dueForReminder ? <span className="shrink-0 rounded-full bg-animeo-warning-soft px-2 py-0.5 text-xs font-extrabold text-animeo-warning">À relancer</span> : null}
            </button>
            {perimeterCenter?.me && client.coordinates ? <ClientQuickActions client={client} homeVisits={visitsHomes(practiceMode)} /> : null}
            {selected && !client.coordinates ? <UnlocatedClientActions client={client} /> : null}
            </div>
            </Fragment>
            );
          })}
          {orderedClients.length > shownCount ? (
            <div className="p-3 text-center">
              <button type="button" onClick={() => setListLimit(shownCount + LIST_PAGE_SIZE)} className="inline-flex min-h-11 items-center rounded-xl bg-animeo-bg px-4 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
                Afficher {Math.min(LIST_PAGE_SIZE, orderedClients.length - shownCount)} de plus ({orderedClients.length - shownCount} restants)
              </button>
            </div>
          ) : null}
        </div>
      ) : (
        <MapEmptyState
          title={emptyList.title}
          detail={emptyList.detail}
          actions={emptyList.widen?.length ? emptyList.widen.map((km) => (
            <button key={km} type="button" onClick={() => setPerimeterRadiusExternally(km)} className="inline-flex min-h-11 items-center rounded-xl bg-animeo-bg px-3.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">{km} km</button>
          )) : null}
        />
      )}
      </>
      )}
    </>
  );

  const practiceCard = practiceOpen && cabinetCoordinates ? (
    <PracticeCard
      label={practiceLabel}
      tiers={practiceTierCounts}
      docked={isPhone}
      onClose={() => setPracticeOpen(false)}
      onCenter={() => fitTo(circleBounds(cabinetCoordinates, 15))}
      onPerimeter={() => { setPracticeOpen(false); applyCirclePerimeter({ ...cabinetCoordinates, label: practicePerimeterLabel }); }}
    />
  ) : null;

  // Téléphone : une seule surface — le panneau montre la fiche choisie, ou
  // la liste. Jamais fiche flottante + liste + fenêtre en même temps.
  const sheetCard = !isPhone ? null
    : selectedAppointment?.coordinates ? <MapAppointmentCard appointment={selectedAppointment} todayId={todayId} onClose={() => setSelectedAppointmentId(null)} docked />
      : selectedClient?.coordinates ? <MapClientPopup client={selectedClient} location={selectedLocation} homeVisits={visitsHomes(practiceMode)} practice={practiceDistanceOrigin} onClose={() => setSelectedId(null)} docked />
        : practiceCard;
  const effectiveSnap: SheetSnap = sheetCard && sheetSnap === "compact" ? "mid" : sheetSnap;
  function changeSheetSnap(next: SheetSnap) {
    // Rabattre le panneau sur une fiche la referme : retour à la liste.
    if (sheetCard && next === "compact") {
      setSelectedId(null);
      setSelectedAppointmentId(null);
      setPracticeOpen(false);
    }
    setSheetSnap(next);
  }
  const sheetSummary = sheetCard ? null : (
    <p className="text-center text-sm font-extrabold text-animeo-dark" data-testid="map-sheet-summary">
      {mapMode === "activity"
        ? `${activityAppointments.length} rendez-vous · ${homeAppointmentCount} à domicile`
        : `${visibleClients.length} client${visibleClients.length > 1 ? "s" : ""}${hasPerimeter || visibleOnly ? " dans cette zone" : " sur la carte"}`}
    </p>
  );

  if (clients.length === 0) {
    return (
      <Card className="p-4 sm:p-5">
        <MapEmptyState
          title="Votre carte est encore vide"
          detail="Ajoutez votre premier client pour commencer à visualiser votre secteur."
          actions={<Link href="/dashboard/clients?nouveau=1" className="inline-flex min-h-11 items-center rounded-xl bg-animeo px-4 text-sm font-extrabold text-white transition hover:bg-animeo-hover">Ajouter un client</Link>}
        />
      </Card>
    );
  }
  const noClientLocated = clients.every((client) => !client.coordinates);

  return (
    <div className="space-y-6">
      {noClientLocated ? (
        <Card className="p-4 sm:p-5">
          <MapEmptyState
            title="Vos clients doivent être localisés"
            detail={`${clients.length} client${clients.length > 1 ? "s n’ont" : " n’a"} pas encore de position exploitable sur la carte.`}
            actions={<LocateAllButton label="Localiser les clients" />}
          />
        </Card>
      ) : null}
      <Card className="p-4 sm:p-5">
        {/* Mode de la carte, et l'option propre à ce mode. */}
        <div className="mb-3 flex flex-col items-start gap-2 border-b border-animeo-border-soft pb-3">
          <div className="flex w-full min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
            <MapModeSwitcher mode={mapMode} onChange={changeMode} />
            <p className="text-xs font-semibold text-animeo-muted" data-testid="map-mode-question">{MAP_MODES.find((mode) => mode.id === mapMode)!.question}</p>
            <div ref={viewsRef} className="relative ml-auto">
              <button
                type="button"
                onClick={() => setViewsOpen((current) => !current)}
                aria-haspopup="true"
                aria-expanded={viewsOpen}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo-bg px-3.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
              >
                <Bookmark aria-hidden="true" className="h-3.5 w-3.5" />
                {activeView ? activeView.name : !viewQuery ? "Tous mes clients" : "Mes vues"}
                <ChevronIcon />
              </button>
              {viewsOpen ? (
                <div role="group" aria-label="Mes vues" className="absolute right-0 z-30 mt-1.5 w-72 rounded-xl border border-animeo-border bg-white p-1.5 shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]">
                  <button type="button" onClick={() => applyMapQuery("")} aria-current={!viewQuery ? "true" : undefined} className="flex min-h-11 w-full items-center rounded-lg px-2.5 text-left text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg aria-[current=true]:bg-animeo-soft">
                    Tous mes clients
                  </button>
                  {views.map((view) => (
                    <div key={view.id} className="flex items-center">
                      <button type="button" onClick={() => applyMapQuery(view.query)} aria-current={activeView?.id === view.id ? "true" : undefined} className="flex min-h-11 min-w-0 flex-1 items-center rounded-lg px-2.5 text-left text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg aria-[current=true]:bg-animeo-soft">
                        <span className="truncate">{view.name}</span>
                      </button>
                      <button type="button" onClick={() => { setViewToDelete(view); setViewsOpen(false); }} aria-label={`Supprimer la vue ${view.name}`} className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-danger">
                        <Trash2 aria-hidden="true" className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                  <div className="my-1 border-t border-animeo-border-soft" />
                  <button type="button" onClick={() => { setSavingView(true); setViewsOpen(false); }} className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2.5 text-left text-sm font-extrabold text-animeo transition hover:bg-animeo-bg">
                    <Star aria-hidden="true" className="h-4 w-4" />Enregistrer cette vue
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {savingView ? <SaveViewModal existingNames={views.map((view) => view.name)} onSave={saveView} onClose={() => setSavingView(false)} /> : null}
          {viewToDelete ? (
            <ConfirmModal
              title={`Supprimer la vue « ${viewToDelete.name} » ?`}
              message="La carte n’est pas modifiée : seul ce raccourci disparaît."
              confirmLabel="Supprimer"
              cancelLabel="Annuler"
              onConfirm={() => deleteView(viewToDelete)}
              onClose={() => setViewToDelete(null)}
            />
          ) : null}
          {mapMode === "activity" ? <Segmented label="Période" options={ACTIVITY_RANGES} value={activityRange} onChange={(range) => { setActivityRange(range); setSelectedAppointmentId(null); }} size="sm" /> : null}
          {mapMode === "reminders" ? <Segmented label="Suivi des visites" options={VISIT_FILTERS} value={visitFilter} onChange={setVisitFilter} size="sm" /> : null}
        </div>
        {/* Une seule ligne seulement quand la recherche garde une largeur
            utile (menu latéral ouvert à 800 px : deux lignes). */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="min-w-0 lg:flex-1"><UnifiedSearch onSelect={handleUnifiedSelect} onSubmitFreeText={setQuery} sources={["client", "animal", "place", "address"]} /></div>

          <div className="flex flex-wrap items-center gap-2">
            <div ref={speciesPanelRef} className="relative">
              <button
                type="button"
                onClick={() => setSpeciesPanelOpen((current) => !current)}
                data-testid="map-species-button"
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

            {mapMode === "clients" || mapMode === "tours" ? <button
              type="button"
              onClick={() => setDueOnly((current) => !current)}
              aria-pressed={dueOnly}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition ${dueOnly ? "bg-animeo-accent text-animeo-dark" : "bg-animeo-warning-soft text-animeo-warning hover:bg-animeo-warning-soft"}`}
            >
              <Icon name="bell" className="h-3.5 w-3.5" />
              À relancer
            </button> : null}

            {mapMode === "activity" ? (
              <span key={`rdv-${activityAppointments.length}`} role="status" className="animate-count-pulse inline-block text-xs font-bold text-animeo-muted">
                {activityAppointments.length} rendez-vous · {homeAppointmentCount} à domicile
              </span>
            ) : (
              <span key={visibleClients.length} role="status" className="animate-count-pulse inline-block text-xs font-bold text-animeo-muted">
                {visibleClients.length} client{visibleClients.length > 1 ? "s" : ""} · {pluralizeAnimals(animalCount)}
              </span>
            )}
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
                    {radiusTiers.map((km) => {
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
              {perimeterCenter.me ? (
                <><strong>{clientsInPerimeter.length} client{clientsInPerimeter.length > 1 ? "s" : ""}</strong> à moins de <strong>{Math.round(perimeterRadiusKm)} km</strong> de vous, du plus proche au plus éloigné.</>
              ) : (
                <><strong>{clientsInPerimeter.length} client{clientsInPerimeter.length > 1 ? "s" : ""}</strong> dans un rayon de <strong>{Math.round(perimeterRadiusKm)} km</strong> autour de <strong>{perimeterCenter.label}</strong>.</>
              )}
              {perimeterCenter.me ? null : unlocatedFilteredCount > 0 ? ` ${unlocatedFilteredCount} client${unlocatedFilteredCount > 1 ? "s" : ""} non localisé${unlocatedFilteredCount > 1 ? "s" : ""}, exclu${unlocatedFilteredCount > 1 ? "s" : ""} de ce calcul.` : " Utile pour évaluer la création d’une nouvelle tournée."}
            </p>
          </div>
        ) : null}

        {positionError ? (
          <div role="alert" className="mt-4 flex items-start gap-3 rounded-2xl border border-animeo-warning-border bg-animeo-warning-soft px-4 py-3 text-sm text-animeo-dark">
            <LocateFixed aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-animeo-warning" />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold">Position non disponible</p>
              <p className="mt-0.5">
                {positionError === "denied"
                  ? "Autorisez la localisation pour afficher les clients proches de vous."
                  : "Votre position n’a pas pu être déterminée. Vérifiez que la localisation de l’appareil est activée, puis réessayez."}
              </p>
            </div>
            <button type="button" onClick={locateMe} className="inline-flex min-h-11 shrink-0 items-center rounded-xl px-3 text-xs font-extrabold text-animeo underline underline-offset-4">Réessayer</button>
            <button type="button" onClick={() => setPositionError(null)} aria-label="Fermer ce message" className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-animeo-muted hover:bg-white/60">×</button>
          </div>
        ) : null}

        {hasPerimeter && mapMode !== "activity" && (notSeenInPerimeter.length > 0 || dueInPerimeter.length > 0 || homeAppointmentsInPerimeter.length > 0) ? (
          <section aria-label="Dans cette zone" data-testid="map-insights" className="mt-3 rounded-2xl border border-animeo-border bg-white px-4 py-1">
            <ul className="divide-y divide-animeo-border-soft">
              {notSeenInPerimeter.length > 0 ? (
                <InsightLine icon={<History aria-hidden="true" className="h-4 w-4" />}>
                  <p className="min-w-0 flex-1"><strong>{notSeenInPerimeter.length} client{notSeenInPerimeter.length > 1 ? "s" : ""}</strong> {notSeenInPerimeter.length > 1 ? "n’ont" : "n’a"} pas été vu{notSeenInPerimeter.length > 1 ? "s" : ""} depuis plus de 12 mois (ou jamais).</p>
                  {mapMode === "reminders" && visitFilter === "old" ? null : (
                    <button type="button" onClick={() => { changeMode("reminders"); setVisitFilter("old"); }} className={insightAction}>Voir {notSeenInPerimeter.length > 1 ? `les ${notSeenInPerimeter.length}` : "ce client"}</button>
                  )}
                </InsightLine>
              ) : null}
              {dueInPerimeter.length > 0 ? (
                <InsightLine icon={<BellRing aria-hidden="true" className="h-4 w-4" />}>
                  <p className="min-w-0 flex-1"><strong>{dueInPerimeter.length} client{dueInPerimeter.length > 1 ? "s" : ""} à relancer</strong> dans cette zone : {dueReminderCount} rappel{dueReminderCount > 1 ? "s" : ""} à envoyer.</p>
                  {!dueOnly || mapMode !== "clients" ? (
                    <button type="button" onClick={() => { if (mapMode !== "clients") changeMode("clients"); setDueOnly(true); }} className={insightAction}>Voir les rappels</button>
                  ) : null}
                  <SendRemindersButton clients={dueInPerimeter} scope="de cette zone" onDone={() => router.refresh()} label="Envoyer les rappels" />
                </InsightLine>
              ) : null}
              {homeAppointmentsInPerimeter.length > 0 ? (
                <InsightLine icon={<CalendarClock aria-hidden="true" className="h-4 w-4" />}>
                  <p className="min-w-0 flex-1"><strong>{homeAppointmentsInPerimeter.length} rendez-vous à domicile</strong> {homeAppointmentsInPerimeter.length > 1 ? "sont" : "est"} déjà programmé{homeAppointmentsInPerimeter.length > 1 ? "s" : ""} ici dans les 7 prochains jours.</p>
                  <button type="button" onClick={() => { changeMode("activity"); setActivityRange("7"); }} className={insightAction}>Voir les RDV</button>
                </InsightLine>
              ) : null}
              {tourSuggestion.length > 0 ? (
                <InsightLine icon={<Route aria-hidden="true" className="h-4 w-4" />}>
                  <p className="min-w-0 flex-1">{tourSuggestion.length} clients à relancer sont regroupés dans cette zone.</p>
                  <button type="button" onClick={() => setPreparingTourIds(tourSuggestion.map((client) => client.id))} className={insightAction}>Préparer une tournée</button>
                </InsightLine>
              ) : null}
            </ul>
          </section>
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
        <div ref={mapCardRef} className={fullscreen ? "overflow-y-auto bg-animeo-bg p-4" : undefined}>
        <Card className="p-4 sm:p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-extrabold text-animeo-dark">{mapTitles[mapMode]}</h2>
              <p className="mt-0.5 text-xs text-animeo-muted">{mapMode === "activity" ? "Rendez-vous à domicile localisés ; ceux du cabinet sont dans la liste" : "Cliquez sur un point pour afficher sa fiche"}</p>
              {mapMode !== "activity" && qualitySummary.total > 0 ? (
                <div ref={qualityRef} className="relative mt-2">
                  <button
                    type="button"
                    onClick={() => setQualityOpen((current) => !current)}
                    aria-haspopup="true"
                    aria-expanded={qualityOpen}
                    className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-lg bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
                  >
                    <MapPin aria-hidden="true" className="h-3.5 w-3.5 text-animeo-muted" />
                    Localisation : {qualitySummary.reliablePercent} % fiable
                  </button>
                  {qualityOpen ? (
                    <div role="group" aria-label="Qualité des positions" className="absolute left-0 z-30 mt-1.5 w-80 rounded-xl border border-animeo-border bg-white p-3 text-sm shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]">
                      <p className="text-xs text-animeo-muted">Sur {qualitySummary.total} client{qualitySummary.total > 1 ? "s" : ""} :</p>
                      <ul className="mt-1.5 space-y-1">
                        {(["precise", "approximate", "unknown"] as const).map((quality) => (
                          <li key={quality}>
                            <button
                              type="button"
                              aria-pressed={qualityFilter === quality}
                              disabled={qualitySummary[quality] === 0}
                              onClick={() => { setQualityFilter((current) => (current === quality ? null : quality)); setQualityOpen(false); }}
                              className="flex min-h-9 w-full items-center justify-between gap-2 rounded-lg px-2 text-left font-bold text-animeo-dark transition hover:bg-animeo-bg disabled:cursor-default disabled:hover:bg-transparent aria-[pressed=true]:bg-animeo-soft"
                            >
                              <span><strong className="tabular-nums">{qualitySummary[quality]}</strong> {quality === "precise" ? "précise" : quality === "approximate" ? "approximative" : "inconnue"}{qualitySummary[quality] > 1 ? "s" : ""}</span>
                              {qualitySummary[quality] > 0 ? <span className="text-xs font-extrabold text-animeo">{qualityFilter === quality ? "Tout afficher" : "Voir"}</span> : null}
                            </button>
                          </li>
                        ))}
                      </ul>
                      {qualitySummary.approximate > 0 ? <p className="mt-2 text-xs text-animeo-muted">Une position approximative se précise en complétant l’adresse (numéro et rue) sur la fiche du client.</p> : null}
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {qualitySummary.unknown > 0 ? <LocateAllButton label={`Localiser les ${qualitySummary.unknown} sans position`} /> : null}
                        {mapMode === "clients" && colorMode !== "quality" ? (
                          <button type="button" onClick={() => { setColorMode("quality"); setQualityOpen(false); }} className="inline-flex min-h-9 items-center rounded-lg bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">
                            Colorer par qualité
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-2 sm:items-end">
              {mapMode === "clients" ? <label className="inline-flex items-center gap-2 text-xs font-extrabold text-animeo-muted">
                Couleur
                <select value={colorMode} onChange={(event) => setColorMode(event.target.value as ColorMode)} className="min-h-9 rounded-lg border border-animeo-border bg-white px-2 text-xs font-extrabold text-animeo-dark">
                  {(Object.keys(colorModeLabels) as ColorMode[]).map((mode) => <option key={mode} value={mode}>{colorModeLabels[mode]}</option>)}
                </select>
              </label> : null}
              <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-animeo-muted" aria-label="Légende">
                {mapMode === "activity" ? APPOINTMENT_LEGEND.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                )) : mapMode === "tours" ? ZONE_LEGEND.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                )) : effectiveColor === "species" ? (
                  <>
                    {speciesLegend.slice(0, 4).map(([item, count]) => (
                      <span key={item} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, item) }} />{item} <span className="tabular-nums text-animeo-dark">{count}</span></span>
                    ))}
                    {speciesLegend.length > 4 ? (
                      <span title={speciesLegend.slice(4).map(([item, count]) => `${item} ${count}`).join(", ")}>+{speciesLegend.length - 4}</span>
                    ) : null}
                  </>
                ) : effectiveColor === "quality" ? (
                  <>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: qualityColors.precise }} />Précise</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border border-dashed border-animeo-dark" style={{ backgroundColor: qualityColors.approximate }} />Approximative (contour en pointillés)</span>
                  </>
                ) : effectiveColor === "visit" ? VISIT_LEGEND.map((item) => (
                  <span key={item.label} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: item.color }} />{item.label}</span>
                )) : (
                  <>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-animeo" />À relancer</span>
                    <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full bg-animeo-subtle" />À jour</span>
                  </>
                )}
                {mapMode !== "activity" && mapMode !== "tours" && effectiveColor !== "due" && effectiveColor !== "quality" ? <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-animeo-accent shadow-sm" />À relancer</span> : null}
              </div>
            </div>
          </div>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={locateMe}
              disabled={locating}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition disabled:cursor-wait ${perimeterCenter?.me ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
            >
              <LocateFixed aria-hidden="true" className="h-3.5 w-3.5" />
              {locating ? "Localisation…" : perimeterCenter?.me ? "Recentrer sur moi" : "Autour de moi"}
            </button>
            {sectorZones.length > 0 && mapMode !== "tours" ? (
              <button type="button" onClick={() => setShowZones((current) => !current)} aria-pressed={showZones} className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${showZones ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}>
                Zones de tournée
              </button>
            ) : null}
            {mapMode !== "activity" ? (
              <div ref={toolsRef} className="relative">
                <button
                  type="button"
                  onClick={() => setToolsOpen((current) => !current)}
                  aria-haspopup="menu"
                  aria-expanded={toolsOpen}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${areaTool || selectMode ? "bg-animeo-dark text-white" : "bg-animeo-bg text-animeo-muted hover:text-animeo-dark"}`}
                >
                  <SquareDashedMousePointer aria-hidden="true" className="h-3.5 w-3.5" />
                  Outils de carte
                </button>
                <ActionMenu
                  open={toolsOpen}
                  onClose={() => setToolsOpen(false)}
                  label="Outils de carte"
                  containerRef={toolsRef}
                  align="start"
                  items={[
                    // Tracer au doigt est peu fiable : sur téléphone, les clients visibles et le mode sélection suffisent.
                    ...(isPhone ? [] : [{ label: "Sélectionner une zone", icon: <SquareDashedMousePointer aria-hidden="true" className="h-4 w-4 shrink-0 text-animeo-muted" />, onSelect: () => { setAreaTool(true); setSelectedId(null); } }]),
                    { label: "Sélectionner les clients visibles", icon: <ListChecks aria-hidden="true" className="h-4 w-4 shrink-0 text-animeo-muted" />, onSelect: selectVisibleClients },
                    { label: selectMode ? "Quitter le mode sélection" : "Choisir des clients un par un", icon: <MousePointerClick aria-hidden="true" className="h-4 w-4 shrink-0 text-animeo-muted" />, onSelect: () => { setSelectMode((current) => !current); setSelectedId(null); } },
                  ]}
                  footer={!isPhone ? <p className="px-3 pb-1.5 pt-1 text-xs text-animeo-muted">Astuce : Ctrl + clic (⌘ + clic sur Mac) ajoute un client à la sélection.</p> : undefined}
                />
              </div>
            ) : null}
            <button type="button" onClick={recenter} className="inline-flex items-center gap-1.5 rounded-xl bg-animeo-bg px-3 py-2 text-xs font-extrabold text-animeo-muted transition hover:text-animeo-dark">
              <Crosshair aria-hidden="true" className="h-3.5 w-3.5" />
              Recentrer
            </button>
            <button type="button" onClick={toggleFullscreen} aria-pressed={fullscreen} className="inline-flex items-center gap-1.5 rounded-xl bg-animeo-bg px-3 py-2 text-xs font-extrabold text-animeo-muted transition hover:text-animeo-dark">
              {fullscreen ? <Minimize2 aria-hidden="true" className="h-3.5 w-3.5" /> : <Maximize2 aria-hidden="true" className="h-3.5 w-3.5" />}
              {fullscreen ? "Quitter le plein écran" : "Plein écran"}
            </button>

            {/* Parcourir les clients localisés, dans l'ordre de la liste. */}
            <div role="group" aria-label="Parcourir les clients sur la carte" className={`ml-auto items-center gap-1 ${mapMode === "activity" ? "hidden" : "flex"}`}>
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
          {areaTool ? (
            <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-animeo-dark px-3 py-2 text-xs font-bold text-white">
              <SquareDashedMousePointer aria-hidden="true" className="h-4 w-4 shrink-0" />
              Tracez un rectangle sur la carte pour sélectionner les clients qu’il contient.
              <button type="button" onClick={() => setAreaTool(false)} className="ml-auto inline-flex min-h-9 items-center rounded-lg px-2 underline underline-offset-4">Annuler</button>
            </p>
          ) : selectMode ? (
            <p role="status" className="mb-3 flex items-center gap-2 rounded-xl bg-animeo-dark px-3 py-2 text-xs font-bold text-white">
              <MousePointerClick aria-hidden="true" className="h-4 w-4 shrink-0" />
              Touchez des clients (carte ou liste) pour les ajouter à la sélection.
              <button type="button" onClick={() => setSelectMode(false)} className="ml-auto inline-flex min-h-9 items-center rounded-lg px-2 underline underline-offset-4">Terminer</button>
            </p>
          ) : null}
          {marked.length > 0 && mapMode !== "activity" ? (
            <div role="region" aria-label="Sélection" data-testid="map-selection-bar" className="mb-3 flex flex-wrap items-center gap-2 rounded-2xl border border-animeo-border bg-animeo-soft px-3 py-2.5">
              <p className="mr-auto text-sm font-extrabold text-animeo-dark">{marked.length} client{marked.length > 1 ? "s" : ""} sélectionné{marked.length > 1 ? "s" : ""}</p>
              <button type="button" onClick={() => setPreparingTourIds(marked)} disabled={markedLocatedCount === 0} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo px-3 text-xs font-extrabold text-white transition hover:bg-animeo-hover disabled:opacity-50">
                <Route aria-hidden="true" className="h-4 w-4" />Préparer une tournée
              </button>
              {markedDue.length > 0 ? <SendRemindersButton clients={markedDue} scope="de la sélection" onDone={() => router.refresh()} /> : null}
              <button type="button" onClick={clearMarked} className="inline-flex min-h-11 items-center px-2 text-xs font-extrabold text-animeo-muted underline decoration-dotted underline-offset-4 hover:text-animeo-dark">Tout désélectionner</button>
            </div>
          ) : null}
          {preparingTourIds ? (
            <PrepareTourModal
              clientIds={preparingTourIds}
              locatedCount={clients.filter((client) => preparingTourIds.includes(client.id) && client.coordinates).length}
              defaultDateId={addDaysToDateId(todayId, 1)}
              onClose={() => setPreparingTourIds(null)}
            />
          ) : null}
          <RealMap
            points={points}
            selectedId={mapMode === "activity" ? (selectedAppointment?.coordinates ? selectedAppointment.id : undefined) : selectedLocation?.key}
            onSelect={mapMode === "activity" ? toggleAppointment : (id, options) => handleClientPick(id, options?.additive ?? false)}
            areaSelect={areaTool}
            onAreaSelect={selectArea}
            autoFit={!hasPerimeter}
            clusterKind={mapMode === "activity" ? "appointments" : mapMode === "reminders" ? "reminders" : "clients"}
            basemap={basemap}
            onBasemapChange={setBasemap}
            onBackgroundClick={() => { setSelectedId(null); setSelectedAppointmentId(null); setPracticeOpen(false); }}
            // ← → passent d'un client à l'autre (voir handleNavigationKeys) ;
            // la carte se déplace à la souris, au doigt, ou par les boutons.
            keyboard={false}
            // Fiche en bas à droite (large) : le point choisi s'affiche
            // au-dessus et à gauche, jamais dessous. Sur téléphone, la fiche
            // passe sous la carte : centrage exact.
            selectedOffset={isPhone ? { x: 0, y: 170 } : showCircleHandle ? { x: 160, y: 90 } : undefined}
            // Hauteur suivant l'écran, jamais plus que la fenêtre : la page
            // reste lisible autour de la carte.
            heightClassName={isPhone ? "h-[calc(100dvh-13rem)] min-h-[460px]" : fullscreen ? "h-[calc(100dvh-11rem)] min-h-[340px]" : "h-[min(610px,70dvh)] min-h-[340px]"}
            bottomSheet={isPhone ? (
              <MapBottomSheet snap={effectiveSnap} onSnapChange={changeSheetSnap} summary={sheetSummary} label={mapMode === "activity" ? "Rendez-vous" : "Clients"}>
                {sheetCard ? <div className="px-3 pb-3">{sheetCard}</div> : listPanel}
              </MapBottomSheet>
            ) : undefined}
            cluster
            wheelZoom="afterClick"
            onViewChange={setMapBounds}
            highlightedId={hoveredId}
            onHover={setHoveredId}
            practice={cabinetCoordinates ? { ...cabinetCoordinates, label: practiceLabel } : null}
            zoneCircles={showZones || mapMode === "tours" ? sectorZones.map((zone) => ({ id: zone.id, lat: zone.lat, lng: zone.lng, radiusKm: zone.radiusKm, label: zone.name })) : []}
            // Pas de fiche flottante pour un client sans position (rien sur
            // la carte ne lui correspond), ni sur téléphone (elle couvrait la
            // moitié de la carte).
            overlay={!showCircleHandle ? undefined
              : selectedAppointment?.coordinates ? <MapAppointmentCard appointment={selectedAppointment} todayId={todayId} onClose={() => setSelectedAppointmentId(null)} />
                : selectedClient?.coordinates ? <MapClientPopup client={selectedClient} location={selectedLocation} homeVisits={visitsHomes(practiceMode)} practice={practiceDistanceOrigin} onClose={() => setSelectedId(null)} />
                  : practiceCard ?? undefined}
            onPracticeClick={() => {
              setSelectedId(null);
              setSelectedAppointmentId(null);
              // À l'ouverture, la carte montre les 15 km autour, le repère
              // à gauche de la fiche (voir fitPadding).
              if (!practiceOpen && cabinetCoordinates) fitTo(circleBounds(cabinetCoordinates, 15));
              setPracticeOpen((current) => !current);
            }}
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
            liveLocation={perimeterCenter?.me ? myPosition : null}
          />
        </Card>
        </div>

        {isPhone ? null : <Card className="overflow-hidden xl:sticky xl:top-6">{listPanel}</Card>}
      </div>

    </div>
  );
}

/**
 * Action groupée d'une zone : envoyer d'un coup les rappels « à relancer »
 * de ses clients, avec le système de rappels existant (même message que
 * l'envoi groupé de la page Rappels), après confirmation.
 */
/**
 * Fiche du lieu d'exercice : combien de clients autour, par palier, et de
 * quoi centrer la carte ou poser un périmètre. Le nom suit le mode
 * d'exercice (« Mon cabinet » / « Mon lieu d'exercice »).
 */
function PracticeCard({ label, tiers, docked, onClose, onCenter, onPerimeter }: {
  label: string;
  tiers: Array<{ km: number; count: number }>;
  docked: boolean;
  onClose: () => void;
  onCenter: () => void;
  onPerimeter: () => void;
}) {
  const action = "flex min-h-11 flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-animeo-border bg-white px-1 py-1.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg";
  return (
    <div className={`rounded-2xl border p-4 ${docked ? "border-animeo-border bg-white" : "border-white/70 bg-white/95 shadow-[0_12px_30px_rgb(var(--theme-shadow-rgb)/0.18)] backdrop-blur-sm"}`} data-testid="practice-card">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-animeo-dark text-white"><House aria-hidden="true" className="h-5 w-5" /></span>
        <h3 className="min-w-0 flex-1 pt-2 font-black text-animeo-dark">{label}</h3>
        <button type="button" onClick={onClose} aria-label={`Fermer la fiche ${label.toLowerCase()}`} className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm text-animeo-dark">
        {tiers.map((tier) => (
          <li key={tier.km}><strong className="tabular-nums">{tier.count}</strong> client{tier.count > 1 ? "s" : ""} à moins de {tier.km} km</li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-animeo-muted">À vol d’oiseau, clients localisés seulement.</p>
      <div className="mt-3 flex gap-1.5">
        <button type="button" onClick={onCenter} className={action}><Crosshair aria-hidden="true" className="h-4 w-4" />Centrer</button>
        <button type="button" onClick={onPerimeter} className={action}><MapPin aria-hidden="true" className="h-4 w-4" />Créer un périmètre</button>
      </div>
    </div>
  );
}

/** État vide : ce qui se passe, et le geste utile — jamais une impasse. */
function MapEmptyState({ title, detail, actions }: { title: string; detail?: string; actions?: ReactNode }) {
  return (
    <div className="px-6 py-8 text-center" role="status">
      <Icon name="map" className="mx-auto h-8 w-8 text-animeo-muted" />
      <p className="mt-3 text-sm font-extrabold text-animeo-dark">{title}</p>
      {detail ? <p className="mx-auto mt-1 max-w-sm text-sm text-animeo-muted">{detail}</p> : null}
      {actions ? <div className="mt-4 flex flex-wrap justify-center gap-2">{actions}</div> : null}
    </div>
  );
}

/** « Enregistrer cette vue » : seul le nom est demandé. */
function SaveViewModal({ existingNames, onSave, onClose }: { existingNames: string[]; onSave: (name: string) => Promise<boolean>; onClose: () => void }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const replaces = existingNames.some((existing) => existing === trimmed);

  async function submit() {
    if (!trimmed) return;
    setSaving(true);
    const saved = await onSave(trimmed);
    setSaving(false);
    if (saved) onClose();
  }

  return (
    <Modal
      title="Enregistrer cette vue"
      description="Mode, filtres, lieu et rayon : la carte telle qu’elle est affichée."
      size="sm"
      onClose={onClose}
      onSubmit={(event) => { event.preventDefault(); void submit(); }}
      footer={
        <>
          <Button type="button" variant="secondary" onClick={onClose}>Annuler</Button>
          <Button type="submit" disabled={saving || !trimmed}>{saving ? "Enregistrement…" : replaces ? "Mettre à jour" : "Enregistrer"}</Button>
        </>
      }
    >
      <label htmlFor="map-view-name" className="mb-1.5 block text-xs font-medium uppercase tracking-[0.08em] text-animeo-muted">Nom</label>
      <input id="map-view-name" autoFocus maxLength={60} value={name} onChange={(event) => setName(event.target.value)} placeholder="Chevaux à relancer, Autour de Caen…" className="min-h-11 w-full rounded-xl border border-animeo-border bg-white px-3 text-sm text-animeo-dark" />
      {replaces ? <p className="mt-2 text-xs text-animeo-muted">Une vue porte déjà ce nom : elle sera mise à jour.</p> : null}
    </Modal>
  );
}

const insightAction = "inline-flex min-h-9 shrink-0 items-center rounded-lg bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft";

function InsightLine({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-2.5 text-sm text-animeo-dark">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-animeo-soft text-animeo">{icon}</span>
      {children}
    </li>
  );
}

/**
 * Envoi groupé des rappels « à relancer » de quelques clients (zone,
 * sélection), avec le système de rappels existant, après confirmation.
 * Absent sans le module Rappels.
 */
function SendRemindersButton({ clients, scope, onDone, label }: { clients: MapClient[]; scope: string; onDone: () => void; label?: string }) {
  const modules = useCurrentUser()?.modules ?? [];
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  if (!hasModule(modules, "REMINDERS")) return null;
  const ids = clients.flatMap((client) => client.dueReminderIds);

  async function send() {
    setConfirming(false);
    setSending(true);
    const result = await sendRemindersBulkAction(ids);
    setSending(false);
    const sent = result.sentIds.length;
    if (sent) notify.success(`${sent} rappel${sent > 1 ? "s" : ""} envoyé${sent > 1 ? "s" : ""}.`);
    if (result.failedNames.length) notify.error(`Non envoyé${result.failedNames.length > 1 ? "s" : ""} : ${result.failedNames.join(", ")}.`);
    onDone();
  }

  return (
    <>
      <button type="button" onClick={() => setConfirming(true)} disabled={sending} className="inline-flex min-h-11 items-center rounded-xl bg-animeo px-3 text-xs font-extrabold text-white transition hover:bg-animeo-hover disabled:opacity-60">
        {sending ? "Envoi…" : label ?? `Envoyer les rappels (${clients.length})`}
      </button>
      {confirming ? (
        <ConfirmModal
          title={`Envoyer ${ids.length} rappel${ids.length > 1 ? "s" : ""} ?`}
          message={`Un e-mail de relance part vers ${clients.length} client${clients.length > 1 ? "s" : ""} ${scope} (${clients.map((client) => client.ownerName).slice(0, 4).join(", ")}${clients.length > 4 ? "…" : ""}), avec le lien de prise de rendez-vous.`}
          confirmLabel="Envoyer"
          cancelLabel="Annuler"
          destructive={false}
          onConfirm={send}
          onClose={() => setConfirming(false)}
        />
      ) : null}
    </>
  );
}

/**
 * « Localiser tout » : géocode les fiches qui ont une adresse mais aucune
 * position, par lots, puis recharge la carte avec le bilan.
 */
function LocateAllButton({ label = "Localiser tout" }: { label?: string }) {
  const router = useRouter();
  const [running, setRunning] = useState(false);

  async function run() {
    setRunning(true);
    const result = await locateUnlocatedClientsAction();
    setRunning(false);
    if (!result.ok) { notify.error(result.error); return; }
    const parts = [`${result.located} localisé${result.located > 1 ? "s" : ""}`];
    if (result.notFound) parts.push(`${result.notFound} introuvable${result.notFound > 1 ? "s" : ""}`);
    if (result.remaining) parts.push(`${result.remaining} restant${result.remaining > 1 ? "s" : ""} à traiter`);
    notify.success(`${parts.join(", ")}.`);
    router.refresh();
  }

  return (
    <button type="button" onClick={run} disabled={running} className="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-lg bg-white px-2.5 text-xs font-extrabold text-animeo-dark ring-1 ring-animeo-border transition hover:bg-animeo-soft disabled:opacity-60">
      <Icon name="map" className="h-3.5 w-3.5" />
      {running ? "Localisation…" : label}
    </button>
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
    const result = await geocodeClientAddressAction(client.id);
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
      <Link href={`/dashboard/clients/${client.id}`} className="inline-flex min-h-11 items-center rounded-xl border border-animeo-border bg-white px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
        Fiche client
      </Link>
    </div>
  );
}

/** Pastille d'un client : l'avatar de son animal représentatif, ou ses initiales. */
function ClientBadge({ client, species, tint }: { client: MapClient; species: AnimalSpecies[]; tint: number }) {
  const { theme } = useDashboardTheme();
  const lead = leadAnimal(client, species);
  const color = lead ? resolveSpeciesColor(theme.speciesColors, lead.species) : "var(--theme-brand)";
  return (
    <span aria-hidden="true" className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ${lead?.avatar ? "text-2xl" : "text-sm font-black text-animeo-dark"}`} style={{ backgroundColor: `color-mix(in srgb, ${color} ${tint}%, white)` }}>
      {lead?.avatar || initialsOf(client.ownerName)}
    </span>
  );
}

/**
 * Actions rapides d'un client proche (Autour de moi) : appeler, prendre
 * rendez-vous, ouvrir la fiche, lancer l'itinéraire — seulement celles
 * possibles.
 */
function ClientQuickActions({ client, homeVisits }: { client: MapClient; homeVisits: boolean }) {
  const { openNewAppointment } = useAppointments();
  const tel = toTelHref(client.phone);
  const action = "flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border border-animeo-border bg-white px-1 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg";
  return (
    <div className="grid grid-cols-4 gap-1.5 px-4 pb-3" role="group" aria-label={`Actions pour ${client.ownerName}`}>
      {tel ? <a href={tel} className={action}><Phone aria-hidden="true" className="h-3.5 w-3.5" />Appeler</a> : null}
      <button type="button" onClick={() => openNewAppointment(undefined, { clientId: client.id, mode: homeVisits ? "home" : undefined })} className={action}>
        <CalendarPlus aria-hidden="true" className="h-3.5 w-3.5" />RDV
      </button>
      <Link href={`/dashboard/clients/${client.id}`} className={action}><UserRound aria-hidden="true" className="h-3.5 w-3.5" />Fiche</Link>
      {client.coordinates ? (
        <a href={`https://www.google.com/maps/dir/?api=1&destination=${client.coordinates.lat},${client.coordinates.lng}`} target="_blank" rel="noopener noreferrer" className={action}>
          <Navigation aria-hidden="true" className="h-3.5 w-3.5" />Itinéraire
        </a>
      ) : null}
    </div>
  );
}

function MapClientPopup({ client, location = null, onClose, docked = false, homeVisits = true, practice = null }: {
  client: MapClient;
  /** Emplacement montré (domicile ou lieu d'un animal) : ville, distance, itinéraire. */
  location?: MapClient["locations"][number] | null;
  onClose: () => void;
  docked?: boolean;
  homeVisits?: boolean;
  /** Lieu d'exercice, pour la distance (« du cabinet », « du lieu d'exercice »). */
  practice?: { lat: number; lng: number; from: string } | null;
}) {
  const { openNewAppointment } = useAppointments();
  // À vol d'oiseau, dit comme tel (jamais un temps de trajet).
  const target = location?.coordinates ?? client.coordinates;
  const distance = practice && target ? haversineDistanceKm(practice, target) : null;
  const tel = toTelHref(client.phone);
  const action = "flex min-h-11 flex-col items-center justify-center gap-1 rounded-xl border border-animeo-border bg-white px-1 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg";
  return (
    <div className={`rounded-2xl border p-4 ${docked ? "border-animeo-border bg-white" : "border-white/70 bg-white/95 shadow-[0_12px_30px_rgb(var(--theme-shadow-rgb)/0.18)] backdrop-blur-sm"}`}>
      <div className="flex items-start gap-3">
        <ClientBadge client={client} species={[]} tint={22} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-black text-animeo-dark">{client.ownerName}</h3>
          {client.animals.length ? (
            <ul className="mt-0.5 space-y-0.5">
              {client.animals.slice(0, 4).map((animal) => (
                <li key={animal.id} className="truncate text-xs">
                  <span className="font-extrabold text-animeo">{animal.name}</span>
                  <span className="font-semibold text-animeo-muted"> · {animal.species}{animal.breed ? ` · ${animal.breed}` : ""}{animal.placeName ? ` · au ${animal.placeName}` : ""}</span>
                </li>
              ))}
              {client.animals.length > 4 ? <li className="text-xs font-semibold text-animeo-muted">et {client.animals.length - 4} autre{client.animals.length - 4 > 1 ? "s" : ""}</li> : null}
            </ul>
          ) : <p className="mt-0.5 text-xs font-semibold text-animeo-muted">Aucun animal</p>}
        </div>
        <button type="button" onClick={onClose} aria-label={`Fermer la fiche de ${client.ownerName}`} className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark">
          <span aria-hidden="true">×</span>
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-animeo-dark">
        <MapPin aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-animeo-muted" />
        <span className="truncate">{location?.placeName ? `Au ${location.placeName}, ${location.city}` : client.city || "Commune inconnue"}</span>
        {distance !== null ? <span className="shrink-0 font-semibold text-animeo-muted">· {formatKm(distance)} {practice!.from}</span> : null}
      </p>
      <dl className="mt-2 space-y-1.5 text-xs">
        <PopupLine label="Dernière consultation" value={client.lastConsultation} />
        <PopupLine label="Prochain rendez-vous" value={client.nextAppointment ?? "Aucun"} />
        <PopupLine label="Prochain rappel" value={client.nextReminder} />
        {/* L'origine de la position est toujours dite : adresse, dernier
            rendez-vous à domicile, ou position approximative. */}
        <PopupLine label="Position" value={positionLabel(client) ?? "Position inconnue"} />
      </dl>
      {/* Actions possibles seulement : pas d'« Appeler » sans téléphone. */}
      <div className="mt-3 grid grid-cols-3 gap-1.5">
        {tel ? (
          <a href={tel} className={action}><Phone aria-hidden="true" className="h-4 w-4" />Appeler</a>
        ) : null}
        {target ? (
          <a href={`https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}`} target="_blank" rel="noopener noreferrer" className={action}>
            <Navigation aria-hidden="true" className="h-4 w-4" />Itinéraire
          </a>
        ) : null}
        <button type="button" onClick={() => openNewAppointment(undefined, { clientId: client.id, mode: homeVisits ? "home" : undefined })} className={action}>
          <CalendarPlus aria-hidden="true" className="h-4 w-4" />Nouveau RDV
        </button>
      </div>
      <Link href={`/dashboard/clients/${client.id}`} className="mt-2 flex w-full items-center justify-center rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-animeo-hover">Voir la fiche client</Link>
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
