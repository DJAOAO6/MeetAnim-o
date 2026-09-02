"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl from "maplibre-gl";
import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { formatDurationSeconds, getMapStyleUrl } from "@/lib/maps/map-utils";

export type TourRunMapPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  color: string;
  kind: "start" | "end" | "stop";
  // Phase 3 bis : durée du tronçon *arrivant* sur ce point (depuis le point
  // précédent dans l'ordre de la tournée) — donnée déjà calculée et stockée
  // par recomputeAndPersistRoute (TourStop.legDurationSeconds), jamais
  // recalculée ici. Absente pour "start" et pour le tronçon final vers
  // "end" (non stocké par arrêt) : pas de pastille dans ces cas plutôt que
  // deviner.
  legDurationSeconds?: number | null;
};

export type TourRunMapClientPoint = {
  id: string;
  lat: number;
  lng: number;
  label: string;
  title: string;
  // Phase 3 bis : rappel dû, réutilise MapClient.dueForReminder
  // (tour-fill.ts / getMapClients, jamais recalculé ici) pour une couleur
  // d'alerte plutôt qu'un pictogramme séparé.
  dueForReminder?: boolean;
};

type TourRunMapProps = {
  points: TourRunMapPoint[];
  routeGeometry: GeoJSON.LineString | null;
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  heightClassName?: string;
  overlay?: ReactNode;
  // Repère "fond de carte" facultatif — clients à proximité, jamais pris en
  // compte dans le fitBounds (sinon en afficher un seul, loin de la
  // tournée, dézoomerait toute la carte à chaque activation du calque).
  clientPoints?: TourRunMapClientPoint[];
  onClientSelect?: (id: string) => void;
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

function clientMarkerElement(point: TourRunMapClientPoint): HTMLDivElement {
  const element = document.createElement("div");
  element.style.width = "22px";
  element.style.height = "22px";
  element.style.borderRadius = "9999px";
  element.style.background = point.dueForReminder ? "#fff3d9" : "#ffffff";
  element.style.border = point.dueForReminder ? "2px solid #c98a1f" : "2px solid #8a97a0";
  element.style.boxShadow = "0 3px 8px rgba(24,59,69,0.22)";
  element.style.cursor = "pointer";
  element.style.opacity = "0.9";
  element.setAttribute("title", point.title);
  element.setAttribute("role", "button");
  element.setAttribute("aria-label", `Client : ${point.title}`);
  return element;
}

function legPillElement(label: string): HTMLDivElement {
  const element = document.createElement("div");
  element.style.pointerEvents = "none";
  element.style.whiteSpace = "nowrap";
  element.style.background = "rgba(255,255,255,0.92)";
  element.style.border = "1px solid #d9e5e2";
  element.style.borderRadius = "9999px";
  element.style.padding = "2px 8px";
  element.style.fontSize = "10px";
  element.style.fontWeight = "800";
  element.style.color = "#5b6b70";
  element.style.boxShadow = "0 2px 6px rgba(24,59,69,0.15)";
  element.textContent = label;
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
export function TourRunMap({ points, routeGeometry, selectedId, onSelect, heightClassName = "h-[500px]", overlay, clientPoints = [], onClientSelect }: TourRunMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markersRef = useRef(new Map<string, maplibregl.Marker>());
  const clientMarkersRef = useRef(new Map<string, maplibregl.Marker>());
  const legMarkersRef = useRef<maplibregl.Marker[]>([]);
  const loadedRef = useRef(false);
  const onSelectRef = useRef(onSelect);
  const onClientSelectRef = useRef(onClientSelect);

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    onClientSelectRef.current = onClientSelect;
  }, [onClientSelect]);

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
    const clientMarkers = clientMarkersRef.current;
    const legMarkers = legMarkersRef.current;

    return () => {
      markers.forEach((marker) => marker.remove());
      markers.clear();
      clientMarkers.forEach((marker) => marker.remove());
      clientMarkers.clear();
      legMarkers.forEach((marker) => marker.remove());
      legMarkers.length = 0;
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

  // Pastilles de temps de trajet par segment — au milieu du tronçon, à
  // partir de legDurationSeconds déjà stocké par arrêt (aucun calcul ici).
  // Recréées entièrement à chaque changement de points : peu d'éléments,
  // pas de sélection à préserver contrairement aux marqueurs d'arrêt.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    legMarkersRef.current.forEach((marker) => marker.remove());
    legMarkersRef.current = [];

    for (let index = 1; index < points.length; index += 1) {
      const to = points[index];
      if (to.legDurationSeconds == null) continue;
      const from = points[index - 1];
      const marker = new maplibregl.Marker({ element: legPillElement(formatDurationSeconds(to.legDurationSeconds)) })
        .setLngLat([(from.lng + to.lng) / 2, (from.lat + to.lat) / 2])
        .addTo(map);
      legMarkersRef.current.push(marker);
    }
  }, [points]);

  // Marqueurs clients (calque optionnel, facultatif) — jamais dans le fitBounds ci-dessus.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const seenIds = new Set(clientPoints.map((point) => point.id));
    for (const [id, marker] of clientMarkersRef.current) {
      if (!seenIds.has(id)) {
        marker.remove();
        clientMarkersRef.current.delete(id);
      }
    }

    for (const point of clientPoints) {
      if (clientMarkersRef.current.has(point.id)) continue;
      const element = clientMarkerElement(point);
      element.addEventListener("click", () => onClientSelectRef.current?.(point.id));
      const marker = new maplibregl.Marker({ element }).setLngLat([point.lng, point.lat]).addTo(map);
      clientMarkersRef.current.set(point.id, marker);
    }
  }, [clientPoints]);

  // Tracé de l'itinéraire — attend que le style soit chargé (source créée
  // dans "load"). Sans géométrie réelle (clé openrouteservice absente ou
  // appel en échec, voir recomputeAndPersistRoute), la carte reste
  // utilisable : ligne droite entre les points, en pointillés — jamais un
  // vide qui laisserait croire à une tournée sans itinéraire du tout.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    function applyRoute() {
      const source = map!.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
      if (!source) return;
      if (routeGeometry) {
        source.setData({ type: "Feature", properties: {}, geometry: routeGeometry });
        map!.setPaintProperty(ROUTE_LAYER_ID, "line-dasharray", null);
      } else if (points.length >= 2) {
        source.setData({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: points.map((point) => [point.lng, point.lat]) } });
        map!.setPaintProperty(ROUTE_LAYER_ID, "line-dasharray", [2, 2]);
      } else {
        source.setData(EMPTY_ROUTE);
      }
    }

    if (loadedRef.current) applyRoute();
    else map.once("load", applyRoute);
  }, [routeGeometry, points]);

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
