"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { ReactNode } from "react";
import type { GeoJsonObject } from "geojson";
import { useEffect, useMemo, useRef, useState } from "react";
import Supercluster from "supercluster";
import { Circle, GeoJSON, MapContainer, Marker, Polyline, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import { destinationPoint, haversineDistanceKm, type GeoBounds, type TerritoryGeometry } from "@/lib/geo";

export type RealMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  color: string;
  badge?: boolean;
  // Hors du périmètre choisi : gardé pour le contexte, atténué et non
  // cliquable. Absent = marqueur normal.
  dimmed?: boolean;
  // Dans la sélection multiple : anneau foncé autour du point.
  marked?: boolean;
  // Position approximative : contour en pointillés (jamais la couleur seule).
  approximate?: boolean;
  // Compté à part dans les groupes (clients à relancer).
  flagged?: boolean;
};

/**
 * Ce que dit un groupe de points : des clients (avec ceux à relancer en
 * pastille), des rendez-vous (« 7 RDV »), ou des relances (« 8 à relancer »).
 */
export type RealMapClusterKind = "clients" | "appointments" | "reminders";

/**
 * Fond de carte. Plan : OpenStreetMap (le fond habituel). Aérien : les
 * photographies aériennes de l'IGN (Géoplateforme, WMTS public — vérifié
 * le 29/09/2026 : sans clé, Licence Ouverte Etalab, « non soumis à limite
 * d'usage » selon les CGU, art. 3.2 ; zooms 0 à 19). Utile pour les haras,
 * fermes et chemins ruraux.
 */
export type RealMapBasemap = "plan" | "aerial";

const BASEMAPS: Record<RealMapBasemap, { url: string; attribution: string; maxNativeZoom: number }> = {
  plan: {
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    maxNativeZoom: 19,
  },
  aerial: {
    url: "https://data.geopf.fr/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=ORTHOIMAGERY.ORTHOPHOTOS&STYLE=normal&TILEMATRIXSET=PM_0_19&FORMAT=image/jpeg&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}",
    attribution: '&copy; <a href="https://www.ign.fr/">IGN</a> – Géoplateforme',
    maxNativeZoom: 19,
  },
};

export type RealMapArea = { id: string; geometry: TerritoryGeometry };
export type RealMapPin = { lat: number; lng: number; label: string };
export type RealMapFitBounds = GeoBounds & { token: string };
export type RealMapPadding = { topLeft: [number, number]; bottomRight: [number, number] };
export type RealMapZoneCircle = { id: string; lat: number; lng: number; radiusKm: number; label: string };

export type RealMapCircle = {
  lat: number;
  lng: number;
  radiusKm: number;
};

export type RealMapFocus = {
  lat: number;
  lng: number;
  zoom: number;
  token: string;
};

type RealMapProps = {
  points: RealMapPoint[];
  selectedId?: string;
  onSelect?: (id: string, options?: { additive: boolean }) => void;
  heightClassName?: string;
  overlay?: ReactNode;
  circle?: RealMapCircle | null;
  focus?: RealMapFocus | null;
  // Poignée de redimensionnement sur le bord du cercle (carte clients, phase
  // 3) : absente sous 640px (voir le prompt dédié — tirer une poignée avec
  // le doigt masque la carte sur mobile, les paliers suffisent).
  circleHandle?: boolean;
  onCircleRadiusChange?: (radiusKm: number, phase: "drag" | "commit") => void;
  // Force la poignée à se replacer au bord du cercle (paliers, nouveau
  // centre) sans l'interrompre pendant un glisser en cours — voir
  // CircleResizeHandle ci-dessous.
  circleHandleResetKey?: number;
  // Centre initial quand `points` est vide (cabinet géocodé, en général) —
  // sans quoi la carte s'ouvrait sur Rouen en dur, quelle que soit la
  // localisation réelle du praticien (Chantier Tournées T0.1). `null`/absent
  // = repli neutre (vue France entière), jamais une ville précise devinée.
  defaultCenter?: [number, number] | null;
  // Position réelle du praticien (API Geolocation, voir use-geolocation.ts)
  // — un point distinct des clients/arrêts, jamais pris en compte dans le
  // fitBounds (sinon un praticien loin de sa tournée dézoomerait toute la
  // carte à chaque activation).
  liveLocation?: { lat: number; lng: number } | null;
  // Clic sur le fond de carte (ni marqueur, ni poignée) : sert à
  // désélectionner. Absent = aucun effet, comme avant.
  onBackgroundClick?: () => void;
  // Décalage, en pixels, appliqué au centrage sur le point sélectionné :
  // le point s'affiche en haut à gauche du centre, hors de la fiche posée
  // sur la carte. Absent = centrage exact, comme avant.
  selectedOffset?: { x: number; y: number };
  // Flèches du clavier gérées par Leaflet (déplacement de la carte). Faux
  // quand la page s'en sert pour autre chose (passer d'un client à l'autre).
  // Absent = comportement Leaflet par défaut, comme avant.
  keyboard?: boolean;
  // Contours de territoires (commune, département, région) : un trait et un
  // remplissage léger, aux couleurs du thème.
  areas?: RealMapArea[];
  // Épingle d'un lieu recherché (une adresse), distincte des clients.
  pin?: RealMapPin | null;
  // Recadrage sur une emprise (cercle, territoire, ensemble des clients) à
  // chaque nouveau jeton, avec les marges demandées.
  fitBounds?: RealMapFitBounds | null;
  fitPadding?: RealMapPadding;
  // Regroupement des marqueurs selon le zoom (supercluster). Absent = un
  // marqueur par point, comme avant.
  cluster?: boolean;
  // Molette : « always » (défaut, comme avant) ou « afterClick » — la
  // molette fait défiler la page tant qu'on n'a pas cliqué sur la carte ;
  // Ctrl + molette zoome toujours.
  wheelZoom?: "always" | "afterClick";
  // Emprise affichée, signalée à chaque fin de déplacement (et au départ).
  onViewChange?: (bounds: GeoBounds) => void;
  // Survol synchronisé avec une liste : point mis en avant (halo), et
  // survol d'un marqueur signalé. La carte ne se déplace jamais pour ça.
  highlightedId?: string | null;
  onHover?: (id: string | null) => void;
  // Repère du lieu d'exercice (cabinet ou point de départ).
  practice?: { lat: number; lng: number; label: string } | null;
  // Clic sur le repère du lieu d'exercice (sa fiche).
  onPracticeClick?: () => void;
  // Secteurs (lieu + rayon), tracés en pointillés avec leur nom.
  zoneCircles?: RealMapZoneCircle[];
  // Panneau posé sur le bas de la carte (téléphone) : à côté de la carte dans
  // le DOM, jamais dedans ; la mention OpenStreetMap remonte en haut pour
  // rester visible.
  bottomSheet?: ReactNode;
  // Sélection d'une zone : tracer un rectangle à la souris (la carte ne se
  // déplace plus pendant ce temps) ; l'emprise est rendue au relâchement.
  areaSelect?: boolean;
  onAreaSelect?: (bounds: GeoBounds) => void;
  // Recadrer sur tous les points quand ils changent (défaut). Faux quand
  // l'appelant cadre lui-même (un périmètre choisi) : filtrer ne doit pas
  // faire quitter la zone regardée.
  autoFit?: boolean;
  clusterKind?: RealMapClusterKind;
  // Fond de carte, et bascule Plan / Aérien (affichée si onBasemapChange).
  basemap?: RealMapBasemap;
  onBasemapChange?: (basemap: RealMapBasemap) => void;
};

// Repli neutre (aucun point, aucun cabinet géocodé) : vue centrée sur la
// France métropolitaine, dézoomée — jamais une ville précise en dur.
const NEUTRAL_DEFAULT_CENTER: [number, number] = [46.6, 2.5];

const circleHandleIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#fff;border:3px solid var(--theme-brand);box-shadow:0 2px 8px rgb(var(--theme-shadow-rgb)/0.35);cursor:ew-resize;"></span>',
  iconSize: [18, 18],
  iconAnchor: [9, 9],
});

/**
 * Poignée glissable sur le bord du cercle de périmètre. Le rayon affiché
 * n'est jamais recalculé depuis `circle.radiusKm` pendant la vie de ce
 * composant (position mémorisée une seule fois, à son montage) : react-
 * leaflet imposerait sinon la position "plein est" à chaque frappe de rayon
 * en direct pendant le glisser, ce qui entrerait en conflit avec le
 * déplacement natif de la souris dans n'importe quelle autre direction. Un
 * remount complet (la clé passée par l'appelant, dérivée de
 * circleHandleResetKey) est le seul moyen prévu de la replacer — utilisé
 * pour un changement de rayon hors glisser (palier, nouveau centre), jamais
 * pendant le glisser lui-même.
 */
function CircleResizeHandle({ circle, onRadiusChange }: { circle: RealMapCircle; onRadiusChange: (radiusKm: number, phase: "drag" | "commit") => void }) {
  // eslint-disable-next-line react-hooks/exhaustive-deps -- calculée une seule fois au montage, voir le commentaire ci-dessus.
  const initialPosition = useMemo(() => destinationPoint(circle, circle.radiusKm, 90), []);

  return (
    <Marker
      position={[initialPosition.lat, initialPosition.lng]}
      icon={circleHandleIcon}
      draggable
      eventHandlers={{
        drag: (event) => {
          const latlng = (event.target as L.Marker).getLatLng();
          onRadiusChange(haversineDistanceKm(circle, { lat: latlng.lat, lng: latlng.lng }), "drag");
        },
        dragend: (event) => {
          const latlng = (event.target as L.Marker).getLatLng();
          onRadiusChange(haversineDistanceKm(circle, { lat: latlng.lat, lng: latlng.lng }), "commit");
        },
      }}
    >
      <Tooltip permanent direction="top" offset={[0, -12]}>{`${Math.round(circle.radiusKm)} km`}</Tooltip>
    </Marker>
  );
}

// Point bleu type "position actuelle" (Google/Apple Plans) — jamais la même
// couleur qu'un marqueur client (couleurs par espèce) ou tournée, pour ne
// jamais être confondu avec un arrêt.
const liveLocationIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:16px;height:16px;border-radius:9999px;background:#1a73e8;border:3px solid white;box-shadow:0 2px 8px rgb(var(--theme-shadow-rgb)/0.4);"></span>',
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

// Épingle d'un lieu recherché : forme de repère, couleur du thème, jamais
// confondue avec un client (rond coloré par espèce).
const pinIcon = L.divIcon({
  className: "",
  html: '<svg width="30" height="40" viewBox="0 0 30 40" aria-hidden="true" style="display:block;filter:drop-shadow(0 4px 6px rgb(var(--theme-shadow-rgb)/0.35))"><path d="M15 1C7.3 1 1 7.1 1 14.7 1 25 15 39 15 39s14-14 14-24.3C29 7.1 22.7 1 15 1z" fill="var(--theme-brand)" stroke="white" stroke-width="2"/><circle cx="15" cy="14.5" r="5" fill="white"/></svg>',
  iconSize: [30, 40],
  iconAnchor: [15, 39],
});

// Une icône par apparence, réutilisée : sans ce cache, chaque rendu
// recréait un L.divIcon par marqueur (et Leaflet remplaçait le DOM).
const iconCache = new Map<string, L.DivIcon>();

function markerIcon(point: RealMapPoint, selected: boolean) {
  const key = `${point.color}|${point.label}|${selected}|${point.badge ?? false}|${point.dimmed ?? false}|${point.marked ?? false}|${point.approximate ?? false}`;
  const cached = iconCache.get(key);
  if (cached) return cached;
  const icon = buildMarkerIcon(point, selected);
  iconCache.set(key, icon);
  return icon;
}

// Lieu d'exercice : un carré arrondi foncé avec une maison, jamais un rond
// coloré (réservé aux clients).
const practiceIcon = L.divIcon({
  className: "",
  html: '<span style="display:flex;align-items:center;justify-content:center;width:34px;height:34px;border-radius:10px;background:var(--theme-heading);border:2px solid white;box-shadow:0 6px 15px rgb(var(--theme-shadow-rgb)/0.3);"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/></svg></span>',
  iconSize: [34, 34],
  iconAnchor: [17, 17],
});

function buildMarkerIcon(point: RealMapPoint, selected: boolean) {
  const size = selected ? 42 : 34;
  const badge = point.badge ? `<span style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#f4b860;border:2px solid white;"></span>` : "";
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${point.color};border:2px ${point.approximate ? "dashed" : "solid"} white;box-shadow:${point.marked ? "0 0 0 3px white,0 0 0 6px var(--theme-heading)," : ""}0 6px 15px rgb(var(--theme-shadow-rgb)/0.28);font-size:${selected ? 18 : 15}px;transition:all .15s ease;${point.dimmed ? "opacity:.35;filter:grayscale(.6);" : ""}">${point.label}${badge}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

const clusterIconCache = new Map<string, L.DivIcon>();

/** Groupe de marqueurs : un disque aux couleurs du thème, avec son effectif. */
const clusterShadow = "box-shadow:0 6px 15px rgb(var(--theme-shadow-rgb)/0.3);";

function clusterIcon(count: number, flagged: number, kind: RealMapClusterKind, dimmed: boolean) {
  const key = `${count}|${flagged}|${kind}|${dimmed}`;
  const cached = clusterIconCache.get(key);
  if (cached) return cached;
  const fade = dimmed ? "opacity:.35;filter:grayscale(.6);" : "";
  const short = (value: number) => (value >= 1000 ? `${Math.round(value / 100) / 10}k` : String(value));
  // Rendez-vous : « 7 RDV ». Relances : une cloche (le symbole « à relancer »
  // des filtres) et le nombre à relancer — compact, pour que deux groupes
  // voisins ne se recouvrent pas ; le titre le dit en toutes lettres.
  const bell = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>';
  const pill = kind === "appointments" ? { html: `${short(count)} RDV`, chars: `${short(count)} RDV`.length }
    : kind === "reminders" && flagged > 0 ? { html: `${bell}${short(flagged)}`, chars: short(flagged).length + 2 } : null;
  let icon: L.DivIcon;
  if (pill) {
    const width = 20 + pill.chars * 7;
    icon = L.divIcon({
      className: "",
      html: `<span style="display:flex;align-items:center;justify-content:center;gap:3px;width:${width}px;height:32px;border-radius:9999px;background:var(--theme-brand);color:#fff;font-weight:800;font-size:12px;white-space:nowrap;border:3px solid white;${clusterShadow}${fade}">${pill.html}</span>`,
      iconSize: [width, 32],
      iconAnchor: [width / 2, 16],
    });
  } else {
    const size = count < 10 ? 36 : count < 100 ? 42 : 50;
    // Relances sans client à relancer : groupe en retrait (rien à faire là).
    const background = kind === "reminders" ? "var(--theme-subtle)" : "var(--theme-brand)";
    const badge = kind === "clients" && flagged > 0
      ? `<span style="position:absolute;top:-6px;right:-8px;min-width:20px;height:20px;padding:0 5px;display:flex;align-items:center;justify-content:center;border-radius:9999px;background:#f4b860;color:#3b2a1a;font-size:11px;font-weight:800;border:2px solid white;">${short(flagged)}</span>`
      : "";
    icon = L.divIcon({
      className: "",
      html: `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${background};color:#fff;font-weight:800;font-size:13px;border:3px solid white;${clusterShadow}${fade}">${short(count)}${badge}</span>`,
      iconSize: [size, size],
      iconAnchor: [size / 2, size / 2],
    });
  }
  clusterIconCache.set(key, icon);
  return icon;
}

/** Titre d'un groupe : ce qu'il contient, en toutes lettres. */
function clusterTitle(count: number, flagged: number, kind: RealMapClusterKind) {
  if (kind === "appointments") return `${count} rendez-vous ici — afficher le détail`;
  return `${count} clients ici${flagged > 0 ? `, dont ${flagged} à relancer` : ""} — afficher le détail`;
}

type ClusterPointProps = { id: string; flagged: number };
type ClusterAggregate = { flagged: number };

/**
 * Marqueurs regroupés selon le zoom. Un clic sur un groupe zoome jusqu'à
 * le séparer ; s'il ne se sépare plus (clients à la même adresse), ses
 * points se déploient en éventail autour de lui — position d'affichage
 * seulement, jamais les coordonnées. Le point choisi n'est jamais caché
 * dans un groupe.
 */
function ClusteredMarkers({ points, selectedId, onSelect, highlightedId, onHover, kind }: { points: RealMapPoint[]; selectedId?: string; onSelect?: (id: string, options?: { additive: boolean }) => void; highlightedId?: string | null; onHover?: (id: string | null) => void; kind: RealMapClusterKind }) {
  const map = useMap();
  const [view, setView] = useState(() => ({ bounds: map.getBounds(), zoom: map.getZoom() }));
  const [spider, setSpider] = useState<{ center: L.LatLng; ids: string[] } | null>(null);
  useMapEvents({
    moveend: () => setView({ bounds: map.getBounds(), zoom: map.getZoom() }),
    zoomstart: () => setSpider(null),
  });

  const byId = useMemo(() => new Map(points.map((point) => [point.id, point])), [points]);
  const indexes = useMemo(() => {
    const build = (list: RealMapPoint[]) => {
      // Chaque groupe compte aussi ses points signalés (clients à relancer).
      const index = new Supercluster<ClusterPointProps, ClusterAggregate>({
        radius: 48,
        maxZoom: map.getMaxZoom(),
        map: (properties) => ({ flagged: properties.flagged }),
        reduce: (accumulated, properties) => { accumulated.flagged += properties.flagged; },
      });
      index.load(list.map((point) => ({ type: "Feature", properties: { id: point.id, flagged: point.flagged ? 1 : 0 }, geometry: { type: "Point", coordinates: [point.lng, point.lat] } })));
      return index;
    };
    const free = points.filter((point) => point.id !== selectedId);
    return { normal: build(free.filter((point) => !point.dimmed)), dimmed: build(free.filter((point) => point.dimmed)) };
  }, [points, selectedId, map]);

  const padded = view.bounds.pad(0.25);
  const bbox: [number, number, number, number] = [padded.getWest(), padded.getSouth(), padded.getEast(), padded.getNorth()];
  const zoom = Math.round(view.zoom);
  const spiderIds = new Set(spider?.ids ?? []);

  function openCluster(index: Supercluster<ClusterPointProps, ClusterAggregate>, clusterId: number, center: L.LatLng) {
    const expansion = index.getClusterExpansionZoom(clusterId);
    if (expansion <= map.getMaxZoom() && expansion > map.getZoom()) {
      if (prefersReducedMotion()) map.setView(center, expansion, { animate: false });
      else map.flyTo(center, expansion, { duration: 0.5 });
      return;
    }
    setSpider({ center, ids: index.getLeaves(clusterId, Infinity).map((leaf) => leaf.properties.id) });
  }

  // Positions en éventail autour du groupe, en pixels, recalculées au zoom courant.
  const spiderPositions = spider
    ? spider.ids.map((id, position) => {
        const origin = map.latLngToLayerPoint(spider.center);
        const radius = 34 + spider.ids.length * 5;
        const angle = (2 * Math.PI * position) / spider.ids.length - Math.PI / 2;
        return { id, latlng: map.layerPointToLatLng(L.point(origin.x + radius * Math.cos(angle), origin.y + radius * Math.sin(angle))) };
      })
    : [];

  const selected = selectedId ? byId.get(selectedId) : undefined;

  return (
    <>
      {(["normal", "dimmed"] as const).flatMap((group) =>
        indexes[group].getClusters(bbox, zoom).map((feature) => {
          const [lng, lat] = feature.geometry.coordinates;
          if ("cluster" in feature.properties && feature.properties.cluster) {
            const { cluster_id: clusterId, point_count: count, flagged } = feature.properties;
            const center = L.latLng(lat, lng);
            return (
              <Marker
                key={`${group}-cluster-${clusterId}`}
                position={center}
                icon={clusterIcon(count, flagged, kind, group === "dimmed")}
                title={clusterTitle(count, flagged, kind)}
                interactive={group === "normal"}
                keyboard={group === "normal"}
                eventHandlers={group === "normal" ? { click: () => openCluster(indexes.normal, clusterId, center) } : {}}
              />
            );
          }
          const point = byId.get((feature.properties as ClusterPointProps).id);
          if (!point || spiderIds.has(point.id)) return null;
          return <PointMarker key={`${point.id}:${point.dimmed ? "hors" : "dans"}:${point.title}`} point={point} selected={false} highlighted={point.id === highlightedId} onSelect={onSelect} onHover={onHover} />;
        }),
      )}
      {spiderPositions.map(({ id, latlng }) => {
        const point = byId.get(id);
        if (!point || !spider) return null;
        return (
          <PointMarkerWithLeg key={`spider-${id}`} point={point} position={latlng} origin={spider.center} onSelect={onSelect} onHover={onHover} highlighted={point.id === highlightedId} />
        );
      })}
      {selected ? <PointMarker key={`selected-${selected.id}`} point={selected} selected onSelect={onSelect} onHover={onHover} /> : null}
    </>
  );
}

function PointMarker({ point, selected, highlighted = false, onSelect, onHover, position }: { point: RealMapPoint; selected: boolean; highlighted?: boolean; onSelect?: (id: string, options?: { additive: boolean }) => void; onHover?: (id: string | null) => void; position?: L.LatLng }) {
  const markerRef = useRef<L.Marker>(null);
  // Halo de survol posé sur l'élément existant (classe CSS) : changer l'icône
  // remplacerait l'élément sous la souris et un clic en cours serait perdu.
  useEffect(() => {
    const marker = markerRef.current;
    marker?.getElement()?.classList.toggle("map-marker-highlight", highlighted && !selected);
    marker?.setZIndexOffset(selected ? 800 : highlighted ? 600 : 0);
  }, [highlighted, selected]);
  return (
    <Marker
      ref={markerRef}
      position={position ?? [point.lat, point.lng]}
      icon={markerIcon(point, selected)}
      title={point.title}
      interactive={!point.dimmed}
      keyboard={!point.dimmed}
      zIndexOffset={selected ? 800 : 0}
      eventHandlers={point.dimmed ? {} : {
        click: (event: L.LeafletMouseEvent) => onSelect?.(point.id, { additive: event.originalEvent.ctrlKey || event.originalEvent.metaKey }),
        mouseover: () => onHover?.(point.id),
        mouseout: () => onHover?.(null),
      }}
    />
  );
}

function PointMarkerWithLeg({ point, position, origin, onSelect, onHover, highlighted }: { point: RealMapPoint; position: L.LatLng; origin: L.LatLng; onSelect?: (id: string, options?: { additive: boolean }) => void; onHover?: (id: string | null) => void; highlighted?: boolean }) {
  return (
    <>
      <Polyline positions={[origin, position]} pathOptions={{ className: "map-spider-leg" }} interactive={false} />
      <PointMarker point={point} selected={false} highlighted={highlighted} onSelect={onSelect} onHover={onHover} position={position} />
    </>
  );
}

/**
 * Tracé d'un rectangle de sélection. Pendant l'outil, glisser trace au lieu
 * de déplacer la carte ; un simple clic (moins de quelques pixels) ne
 * sélectionne rien.
 */
function AreaSelector({ onSelect }: { onSelect: (bounds: GeoBounds) => void }) {
  const map = useMap();
  const startRef = useRef<L.LatLng | null>(null);
  const [box, setBox] = useState<L.LatLngBounds | null>(null);
  useEffect(() => {
    map.dragging.disable();
    map.getContainer().classList.add("map-area-select");
    return () => {
      map.dragging.enable();
      map.getContainer().classList.remove("map-area-select");
    };
  }, [map]);
  useMapEvents({
    mousedown: (event) => { startRef.current = event.latlng; setBox(L.latLngBounds(event.latlng, event.latlng)); },
    mousemove: (event) => { if (startRef.current) setBox(L.latLngBounds(startRef.current, event.latlng)); },
    mouseup: (event) => {
      const start = startRef.current;
      startRef.current = null;
      setBox(null);
      if (!start) return;
      if (map.latLngToContainerPoint(start).distanceTo(map.latLngToContainerPoint(event.latlng)) < 8) return;
      const bounds = L.latLngBounds(start, event.latlng);
      onSelect({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });
    },
  });
  return box ? <Rectangle bounds={box} pathOptions={{ className: "map-selection" }} interactive={false} /> : null;
}

/** Emprise affichée : au départ, puis à chaque fin de déplacement ou de zoom. */
function ViewTracker({ onChange }: { onChange: (bounds: GeoBounds) => void }) {
  const map = useMap();
  const report = () => {
    const bounds = map.getBounds();
    onChange({ south: bounds.getSouth(), west: bounds.getWest(), north: bounds.getNorth(), east: bounds.getEast() });
  };
  useMapEvents({ moveend: report });
  useEffect(() => {
    report();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

/**
 * Molette « après un clic » : tant que la carte n'a pas été touchée, la
 * molette fait défiler la page (sinon la carte capturait tout le scroll).
 * Ctrl + molette zoome toujours, comme sur les cartes en ligne courantes.
 */
function WheelActivation({ onHint }: { onHint: (visible: boolean) => void }) {
  const map = useMap();
  useMapEvents({
    click: () => { map.scrollWheelZoom.enable(); onHint(false); },
    mouseout: () => map.scrollWheelZoom.disable(),
  });
  useEffect(() => {
    const container = map.getContainer();
    let hideTimer: number | undefined;
    function handleWheel(event: WheelEvent) {
      if (map.scrollWheelZoom.enabled()) return;
      if (event.ctrlKey) {
        event.preventDefault();
        map.setZoom(map.getZoom() + (event.deltaY < 0 ? 1 : -1));
        return;
      }
      onHint(true);
      window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(() => onHint(false), 1600);
    }
    container.addEventListener("wheel", handleWheel, { passive: false });
    return () => { container.removeEventListener("wheel", handleWheel); window.clearTimeout(hideTimer); };
  }, [map, onHint]);
  return null;
}

function FitToPoints({ points }: { points: RealMapPoint[] }) {
  const map = useMap();
  const boundsKey = points.map((point) => `${point.id}:${point.lat}:${point.lng}`).join("|");

  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 13, { animate: true });
      return;
    }
    const bounds = L.latLngBounds(points.map((point) => [point.lat, point.lng]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boundsKey]);

  return null;
}

/** Mouvement réduit demandé : la carte saute au lieu de voler. */
function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function FlyToSelected({ point, offset }: { point?: RealMapPoint; offset?: { x: number; y: number } }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    const zoom = Math.max(map.getZoom(), 13);
    // Centre déplacé de `offset` : le point apparaît en haut à gauche du
    // centre, et la fiche posée en bas à droite ne le recouvre pas.
    const target = offset
      ? map.unproject(map.project([point.lat, point.lng], zoom).add([offset.x, offset.y]), zoom)
      : L.latLng(point.lat, point.lng);
    if (prefersReducedMotion()) map.setView(target, zoom, { animate: false });
    else map.flyTo(target, zoom, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id]);

  return null;
}

function FitToBounds({ target, padding }: { target?: RealMapFitBounds | null; padding?: RealMapPadding }) {
  const map = useMap();

  useEffect(() => {
    if (!target) return;
    // flyToBounds, jamais un zoom fixe : 15 km → 50 km dézoome jusqu'à voir
    // tout le cercle, 50 km → 15 km rezoome.
    const options = { paddingTopLeft: padding?.topLeft ?? [40, 40], paddingBottomRight: padding?.bottomRight ?? [40, 40], maxZoom: 15 } as const;
    const bounds: L.LatLngBoundsExpression = [[target.south, target.west], [target.north, target.east]];
    if (prefersReducedMotion()) map.fitBounds(bounds, { ...options, animate: false });
    else map.flyToBounds(bounds, { ...options, duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target?.token]);

  return null;
}

function BackgroundClick({ onClick }: { onClick: () => void }) {
  // Les clics sur un marqueur ne remontent pas jusqu'à la carte (Leaflet) :
  // seul un clic sur le fond arrive ici.
  useMapEvents({ click: () => onClick() });
  return null;
}

function FlyToFocus({ focus }: { focus?: RealMapFocus | null }) {
  const map = useMap();

  useEffect(() => {
    if (!focus) return;
    map.flyTo([focus.lat, focus.lng], focus.zoom, { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token]);

  return null;
}

export function RealMap({ points, selectedId, onSelect, heightClassName = "h-[500px]", overlay, circle, focus, circleHandle = false, onCircleRadiusChange, circleHandleResetKey = 0, defaultCenter = null, liveLocation = null, onBackgroundClick, selectedOffset, keyboard = true, areas = [], pin = null, fitBounds = null, fitPadding, cluster = false, wheelZoom = "always", onViewChange, highlightedId = null, onHover, practice = null, zoneCircles = [], bottomSheet, areaSelect = false, onAreaSelect, autoFit = true, clusterKind = "clients", onPracticeClick, basemap = "plan", onBasemapChange }: RealMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (points.length > 0) return [points[0].lat, points[0].lng];
    if (defaultCenter) return defaultCenter;
    return NEUTRAL_DEFAULT_CENTER;
  }, [points, defaultCenter]);
  const zoom = points.length > 0 || defaultCenter ? 12 : 5;
  const selectedPoint = points.find((point) => point.id === selectedId);
  const mapRef = useRef<L.Map | null>(null);
  const [wheelHint, setWheelHint] = useState(false);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-animeo-border ${bottomSheet ? "map-with-sheet" : ""} ${heightClassName}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom={wheelZoom === "always"} keyboard={keyboard} className="h-full w-full" ref={mapRef}>
        {wheelZoom === "afterClick" ? <WheelActivation onHint={setWheelHint} /> : null}
        {onViewChange ? <ViewTracker onChange={onViewChange} /> : null}
        {areaSelect && onAreaSelect ? <AreaSelector onSelect={onAreaSelect} /> : null}
        {/* Changer de fond remplace seulement les tuiles : zoom, centre,
            points et contours restent en place. */}
        <TileLayer key={basemap} attribution={BASEMAPS[basemap].attribution} url={BASEMAPS[basemap].url} maxNativeZoom={BASEMAPS[basemap].maxNativeZoom} />
        {autoFit ? <FitToPoints points={points} /> : null}
        <FlyToSelected point={selectedPoint} offset={selectedOffset} />
        {onBackgroundClick ? <BackgroundClick onClick={onBackgroundClick} /> : null}
        <FlyToFocus focus={focus} />
        <FitToBounds target={fitBounds} padding={fitPadding} />
        {areas.map((area) => (
          // Couleurs portées par la classe (globals.css) : les jetons du
          // thème s'appliquent, y compris en mode sombre.
          <GeoJSON key={area.id} data={area.geometry as GeoJsonObject} style={{ className: "map-territory" }} interactive={false} />
        ))}
        {circle ? (
          <Circle
            center={[circle.lat, circle.lng]}
            radius={circle.radiusKm * 1000}
            pathOptions={{ className: "map-perimeter" }}
          />
        ) : null}
        {pin ? <Marker position={[pin.lat, pin.lng]} icon={pinIcon} title={pin.label} interactive={false} zIndexOffset={900} /> : null}
        {zoneCircles.map((zone) => (
          <Circle key={zone.id} center={[zone.lat, zone.lng]} radius={zone.radiusKm * 1000} pathOptions={{ className: "map-zone" }} interactive={false}>
            <Tooltip permanent direction="center" className="map-zone-label">{zone.label}</Tooltip>
          </Circle>
        ))}
        {practice ? (
          <Marker
            position={[practice.lat, practice.lng]}
            icon={practiceIcon}
            title={practice.label}
            zIndexOffset={700}
            keyboard={Boolean(onPracticeClick)}
            interactive={Boolean(onPracticeClick)}
            eventHandlers={onPracticeClick ? { click: () => onPracticeClick() } : {}}
          />
        ) : null}
        {liveLocation ? (
          <Marker position={[liveLocation.lat, liveLocation.lng]} icon={liveLocationIcon} title="Ma position" zIndexOffset={1000} />
        ) : null}
        {circle && circleHandle && onCircleRadiusChange ? (
          <CircleResizeHandle key={`${circle.lat}:${circle.lng}:${circleHandleResetKey}`} circle={circle} onRadiusChange={onCircleRadiusChange} />
        ) : null}
        {cluster ? <ClusteredMarkers points={points} selectedId={selectedId} onSelect={onSelect} highlightedId={highlightedId} onHover={onHover} kind={clusterKind} /> : points.map((point) => (
          <Marker
            // react-leaflet ne met à jour ni `title` ni `interactive` d'un
            // marqueur existant : un point qui passe hors du périmètre est
            // recréé, sinon il resterait cliquable avec son ancien titre.
            key={`${point.id}:${point.dimmed ? "hors" : "dans"}`}
            position={[point.lat, point.lng]}
            icon={markerIcon(point, point.id === selectedId)}
            title={point.title}
            interactive={!point.dimmed}
            keyboard={!point.dimmed}
            eventHandlers={point.dimmed ? {} : { click: (event) => onSelect?.(point.id, { additive: event.originalEvent.ctrlKey || event.originalEvent.metaKey }) }}
          />
        ))}
      </MapContainer>

      {overlay ? <div className="pointer-events-none absolute bottom-4 right-4 z-[500] w-[min(300px,calc(100%-2rem))]"><div className="pointer-events-auto">{overlay}</div></div> : null}
      {onBasemapChange ? (
        <div role="group" aria-label="Fond de carte" className="absolute left-14 top-2.5 z-[500] flex rounded-lg border border-animeo-border bg-white p-0.5 shadow-sm">
          {(["plan", "aerial"] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={basemap === option}
              onClick={() => onBasemapChange(option)}
              className={`min-h-8 rounded-md px-2.5 text-xs font-extrabold transition ${basemap === option ? "bg-animeo-dark text-white" : "text-animeo-muted hover:text-animeo-dark"}`}
            >
              {option === "plan" ? "Plan" : "Aérien"}
            </button>
          ))}
        </div>
      ) : null}
      {bottomSheet}
      {wheelHint ? (
        <div role="status" className="pointer-events-none absolute inset-x-0 top-3 z-[500] mx-auto w-fit rounded-xl bg-animeo-dark/85 px-3 py-2 text-xs font-bold text-white">
          Cliquez sur la carte pour zoomer à la molette (ou Ctrl + molette)
        </div>
      ) : null}
    </div>
  );
}
