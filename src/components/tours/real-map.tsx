"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { Circle, MapContainer, Marker, TileLayer, Tooltip, useMap } from "react-leaflet";
import { destinationPoint, haversineDistanceKm } from "@/lib/geo";

export type RealMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  color: string;
  badge?: boolean;
};

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
};

const circleHandleIcon = L.divIcon({
  className: "",
  html: '<span style="display:block;width:18px;height:18px;border-radius:9999px;background:#fff;border:3px solid #4FAF9F;box-shadow:0 2px 8px rgba(24,59,69,0.35);cursor:ew-resize;"></span>',
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

function markerIcon(point: RealMapPoint, selected: boolean) {
  const size = selected ? 42 : 34;
  const badge = point.badge ? `<span style="position:absolute;top:-2px;right:-2px;width:12px;height:12px;border-radius:9999px;background:#f4b860;border:2px solid white;"></span>` : "";
  return L.divIcon({
    className: "",
    html: `<span style="position:relative;display:flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:9999px;background:${point.color};border:2px solid white;box-shadow:0 6px 15px rgba(24,59,69,0.28);font-size:${selected ? 18 : 15}px;transition:all .15s ease;">${point.label}${badge}</span>`,
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

function FlyToSelected({ point }: { point?: RealMapPoint }) {
  const map = useMap();

  useEffect(() => {
    if (!point) return;
    map.flyTo([point.lat, point.lng], Math.max(map.getZoom(), 13), { duration: 0.6 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [point?.id]);

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

export function RealMap({ points, selectedId, onSelect, heightClassName = "h-[500px]", overlay, circle, focus, circleHandle = false, onCircleRadiusChange, circleHandleResetKey = 0 }: RealMapProps) {
  const center = useMemo<[number, number]>(() => {
    if (points.length === 0) return [49.4432, 1.0999];
    return [points[0].lat, points[0].lng];
  }, [points]);
  const selectedPoint = points.find((point) => point.id === selectedId);
  const mapRef = useRef<L.Map | null>(null);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[#dbe7e3] ${heightClassName}`}>
      <MapContainer center={center} zoom={12} scrollWheelZoom className="h-full w-full" ref={mapRef}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FitToPoints points={points} />
        <FlyToSelected point={selectedPoint} />
        <FlyToFocus focus={focus} />
        {circle ? (
          <Circle
            center={[circle.lat, circle.lng]}
            radius={circle.radiusKm * 1000}
            pathOptions={{ color: "#4FAF9F", fillColor: "#4FAF9F", fillOpacity: 0.12, weight: 2 }}
          />
        ) : null}
        {circle && circleHandle && onCircleRadiusChange ? (
          <CircleResizeHandle key={`${circle.lat}:${circle.lng}:${circleHandleResetKey}`} circle={circle} onRadiusChange={onCircleRadiusChange} />
        ) : null}
        {points.map((point) => (
          <Marker
            key={point.id}
            position={[point.lat, point.lng]}
            icon={markerIcon(point, point.id === selectedId)}
            title={point.title}
            eventHandlers={{ click: () => onSelect?.(point.id) }}
          />
        ))}
      </MapContainer>

      {overlay ? <div className="pointer-events-none absolute bottom-4 right-4 z-[500] w-[min(300px,calc(100%-2rem))]"><div className="pointer-events-auto">{overlay}</div></div> : null}
    </div>
  );
}
