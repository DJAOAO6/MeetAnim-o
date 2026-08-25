"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

export type RealMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  color: string;
  badge?: boolean;
};

type RealMapProps = {
  points: RealMapPoint[];
  selectedId?: string;
  onSelect?: (id: string) => void;
  heightClassName?: string;
  overlay?: ReactNode;
};

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

export function RealMap({ points, selectedId, onSelect, heightClassName = "h-[500px]", overlay }: RealMapProps) {
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
