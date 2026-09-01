"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { getMapStyleUrl } from "@/lib/maps/map-utils";

export type TourRunMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  color: string;
  kind: "start" | "end" | "stop";
};

type TourRunMapProps = {
  points: TourRunMapPoint[];
  routeGeometry: GeoJSON.LineString | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  heightClassName?: string;
  overlay?: ReactNode;
};

const NORMANDY_DEFAULT_CENTER: [number, number] = [1.0999, 49.4432];
const ROUTE_SOURCE_ID = "tour-run-route";
const ROUTE_LAYER_ID = "tour-run-route-line";
const EMPTY_ROUTE: GeoJSON.Feature<GeoJSON.LineString> = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } };

function markerElement(point: TourRunMapPoint, selected: boolean): HTMLDivElement {
  const size = selected ? 42 : point.kind === "stop" ? 32 : 36;
  const element = document.createElement("div");
  element.style.width = `${size}px`;
  element.style.height = `${size}px`;
  element.style.borderRadius = point.kind === "stop" ? "9999px" : "10px";
  element.style.background = point.color;
  element.style.border = "2px solid white";
  element.style.boxShadow = "0 6px 15px rgba(24,59,69,0.28)";
  element.style.display = "flex";
  element.style.alignItems = "center";
  element.style.justifyContent = "center";
  element.style.fontSize = selected ? "18px" : "14px";
  element.style.fontWeight = "800";
  element.style.color = "#fff";
  element.style.cursor = "pointer";
  element.style.transition = "all .15s ease";
  element.textContent = point.label;
  element.setAttribute("title", point.title);
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", point.title);
  return element;
}

/**
 * Carte interactive MapLibre pour l'éditeur de tournées — distincte de
 * RealMap (Leaflet, carte clients) : bibliothèques différentes par choix
 * explicite pour cette page, les deux coexistent sans se gêner. Impérative
 * (pas de wrapper React officiel pour MapLibre) : une seule instance créée
 * au montage, marqueurs et tracé mis à jour via des effets dédiés plutôt que
 * recréés à chaque render.
 */
export function TourRunMap({ points, routeGeometry, selectedId, onSelect, heightClassName = "h-[500px]", overlay }: TourRunMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    if (!containerRef.current) return;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: getMapStyleUrl(),
      center: NORMANDY_DEFAULT_CENTER,
      zoom: 10,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => {
      map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data: EMPTY_ROUTE });
      map.addLayer({
        id: ROUTE_LAYER_ID,
        type: "line",
        source: ROUTE_SOURCE_ID,
        layout: { "line-join": "round", "line-cap": "round" },
        paint: { "line-color": "#4FAF9F", "line-width": 4, "line-opacity": 0.85 },
      });
      loadedRef.current = true;
    });
    mapRef.current = map;
    const markers = markersRef.current;

    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      map.remove();
      mapRef.current = null;
      loadedRef.current = false;
    };
    // Une seule instance pour la vie du composant — points/routeGeometry sont gérés par les effets ci-dessous.
  }, []);

  // Marqueurs : diff plutôt que recréation totale (évite un flash à chaque changement d'arrêt).
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seenIds = new Set(points.map((point) => point.id));
    for (const [id, marker] of markersRef.current) {
      if (!seenIds.has(id)) {
        marker.remove();
        markersRef.current.delete(id);
      }
    }

    for (const point of points) {
      const existing = markersRef.current.get(point.id);
      if (existing) {
        existing.setLngLat([point.lng, point.lat]);
        existing.getElement().replaceWith(markerElement(point, point.id === selectedId));
        continue;
      }
      const element = markerElement(point, point.id === selectedId);
      element.addEventListener("click", () => onSelectRef.current?.(point.id));
      const marker = new maplibregl.Marker({ element }).setLngLat([point.lng, point.lat]).addTo(map);
      markersRef.current.set(point.id, marker);
    }

    if (points.length === 1) {
      map.easeTo({ center: [points[0].lng, points[0].lat], zoom: Math.max(map.getZoom(), 12), duration: 400 });
    } else if (points.length > 1) {
      const bounds = points.reduce(
        (acc, point) => acc.extend([point.lng, point.lat]),
        new maplibregl.LngLatBounds([points[0].lng, points[0].lat], [points[0].lng, points[0].lat]),
      );
      map.fitBounds(bounds, { padding: 56, maxZoom: 14, duration: 400 });
    }
  }, [points, selectedId]);

  // Tracé de l'itinéraire — attend que le style soit chargé (source créée dans "load").
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function applyRoute() {
      const source = map!.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      source.setData(routeGeometry ? { type: "Feature", properties: {}, geometry: routeGeometry } : EMPTY_ROUTE);
    }

    if (loadedRef.current) applyRoute();
    else map.once("load", applyRoute);
  }, [routeGeometry]);

  return (
    <div className={`relative overflow-hidden rounded-2xl border border-[#dbe7e3] ${heightClassName}`}>
      <div ref={containerRef} className="h-full w-full" />
      {overlay ? (
        <div className="pointer-events-none absolute bottom-4 right-4 z-10 w-[min(300px,calc(100%-2rem))]">
          <div className="pointer-events-auto">{overlay}</div>
        </div>
      ) : null}
    </div>
  );
}
