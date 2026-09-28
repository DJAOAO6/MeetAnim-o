"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { ReactNode } from "react";
import type { GeoJsonObject } from "geojson";
import { useEffect, useMemo, useRef } from "react";
import { Circle, GeoJSON, MapContainer, Marker, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
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
};

export type RealMapArea = { id: string; geometry: TerritoryGeometry };
export type RealMapPin = { lat: number; lng: number; label: string };
export type RealMapFitBounds = GeoBounds & { token: string };
export type RealMapPadding = { topLeft: [number, number]; bottomRight: [number, number] };

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
  onSelect?: (id: string) => void;
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

function markerIcon(point: RealMapPoint, selected: boolean) {
  const size = selected ? 42 : 34;
  const badge = point.badge ? `<span style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#f4b860;border:2px solid white;"></span>` : "";
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${point.color};border:2px solid white;box-shadow:0 6px 15px rgb(var(--theme-shadow-rgb)/0.28);font-size:${selected ? 18 : 15}px;transition:all .15s ease;${point.dimmed ? "opacity:.35;filter:grayscale(.6);" : ""}">${point.label}${badge}</span>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
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
    map.flyTo(target, zoom, { duration: 0.6 });
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
    map.flyToBounds(
      [[target.south, target.west], [target.north, target.east]],
      { paddingTopLeft: padding?.topLeft ?? [40, 40], paddingBottomRight: padding?.bottomRight ?? [40, 40], duration: 0.6, maxZoom: 15 },
    );
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

export function RealMap({ points, selectedId, onSelect, heightClassName = "h-[500px]", overlay, circle, focus, circleHandle = false, onCircleRadiusChange, circleHandleResetKey = 0, defaultCenter = null, liveLocation = null, onBackgroundClick, selectedOffset, keyboard = true, areas = [], pin = null, fitBounds = null, fitPadding }: RealMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (points.length > 0) return [points[0].lat, points[0].lng];
    if (defaultCenter) return defaultCenter;
    return NEUTRAL_DEFAULT_CENTER;
  }, [points, defaultCenter]);
  const zoom = points.length > 0 || defaultCenter ? 12 : 5;
  const selectedPoint = points.find((point) => point.id === selectedId);
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-animeo-border ${heightClassName}`}>
      <MapContainer center={center} zoom={zoom} scrollWheelZoom keyboard={keyboard} className="h-full w-full" ref={mapRef}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints points={points} />
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
        {liveLocation ? (
          <Marker position={[liveLocation.lat, liveLocation.lng]} icon={liveLocationIcon} title="Ma position" zIndexOffset={1000} />
        ) : null}
        {circle && circleHandle && onCircleRadiusChange ? (
          <CircleResizeHandle key={`${circle.lat}:${circle.lng}:${circleHandleResetKey}`} circle={circle} onRadiusChange={onCircleRadiusChange} />
        ) : null}
        {points.map((point) => (
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
            eventHandlers={point.dimmed ? {} : { click: () => onSelect?.(point.id) }}
          />
        ))}
      </MapContainer>

      {overlay ? <div className="pointer-events-none absolute bottom-4 right-4 z-[500] w-[min(300px,calc(100%-2rem))]"><div className="pointer-events-auto">{overlay}</div></div> : null}
    </div>
  );
}
