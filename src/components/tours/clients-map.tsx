"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useMemo, useRef, useState } from "react";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import { UnifiedSearch, type UnifiedSearchSelection } from "@/components/search/unified-search";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { animalSpeciesList, resolveSpeciesColor } from "@/data/species";
import { haversineDistanceKm } from "@/lib/geo";
import type { AnimalSpecies, MapClient } from "@/data/tours";

const RealMap = dynamic(() => import("@/components/tours/real-map").then((mod) => mod.RealMap), {
  ssr: false,
  loading: () => <div className="flex h-[610px] items-center justify-center rounded-2xl border border-[#dbe7e3] bg-[#edf4ef] text-sm font-bold text-animeo-muted">Chargement de la carte…</div>,
});

type SpeciesFilter = "Tous les clients" | AnimalSpecies;

type ClientsMapProps = {
  clients: MapClient[];
};

type PerimeterCenter = { lat: number; lng: number; label: string };

const speciesFilters: SpeciesFilter[] = ["Tous les clients", "Chien", "Chat", "Cheval", "NAC", "Petit ruminant"];
const radiusOptions = [2, 5, 10, 15, 20, 25, 30, 50];

export function ClientsMap({ clients }: ClientsMapProps) {
  const { theme } = useDashboardTheme();
  const [speciesFilter, setSpeciesFilter] = useState<SpeciesFilter>("Tous les clients");
  const [dueOnly, setDueOnly] = useState(false);
  const [cityFilter, setCityFilter] = useState("Toutes les villes");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");
  const cities = Array.from(new Set(clients.map((client) => client.city))).sort((first, second) => first.localeCompare(second, "fr"));

  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom: number; token: string } | null>(null);
  const [perimeterMode, setPerimeterMode] = useState(false);
  const [perimeterCenter, setPerimeterCenter] = useState<PerimeterCenter | null>(null);
  const [perimeterRadiusKm, setPerimeterRadiusKm] = useState(15);

  const filteredClients = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase("fr-FR");
    return clients.filter((client) => {
      const matchesSpecies = speciesFilter === "Tous les clients" || client.species === speciesFilter;
      const matchesReminder = !dueOnly || client.dueForReminder;
      const matchesCity = cityFilter === "Toutes les villes" || client.city === cityFilter;
      const matchesQuery = !normalizedQuery || `${client.ownerName} ${client.animalName}`.toLocaleLowerCase("fr-FR").includes(normalizedQuery);
      return matchesSpecies && matchesReminder && matchesCity && matchesQuery;
    });
  }, [cityFilter, clients, dueOnly, query, speciesFilter]);

  const clientsInPerimeter = useMemo(() => {
    if (!perimeterCenter) return filteredClients;
    // Un client sans coordonnées ne peut pas être comparé à un centre de
    // périmètre : exclu plutôt que deviné.
    return filteredClients.filter((client) => client.coordinates && haversineDistanceKm(perimeterCenter, client.coordinates) <= perimeterRadiusKm);
  }, [filteredClients, perimeterCenter, perimeterRadiusKm]);

  const visibleClients = perimeterCenter ? clientsInPerimeter : filteredClients;
  const locatedClients = visibleClients.filter((client) => client.coordinates);
  const selectedClient = visibleClients.find((client) => client.id === selectedId) ?? visibleClients[0];
  const points = locatedClients.map((client) => ({
    id: client.id,
    lat: client.coordinates!.lat,
    lng: client.coordinates!.lng,
    label: client.avatar,
    title: `${client.ownerName} · ${client.animalName} · ${client.city} · ${client.species}${client.dueForReminder ? " · À relancer" : ""}`,
    color: resolveSpeciesColor(theme.speciesColors, client.species),
    badge: client.dueForReminder,
  }));

  const focusTokenRef = useRef(0);
  function focusOn(lat: number, lng: number, zoom: number, tokenSeed: string) {
    focusTokenRef.current += 1;
    setFocus({ lat, lng, zoom, token: `${tokenSeed}:${focusTokenRef.current}` });
  }

  // Sélectionner un lieu dans la recherche unifiée applique directement un
  // périmètre (pas de mode à activer au préalable, contrairement à l'ancien
  // "Créer un périmètre" + clic sur la carte, conservé ci-dessous pour la
  // phase 1).
  function handleUnifiedSelect(selection: UnifiedSearchSelection) {
    if (selection.kind === "place") {
      focusOn(selection.place.lat, selection.place.lng, selection.place.zoom, selection.place.id);
      setPerimeterCenter({ lat: selection.place.lat, lng: selection.place.lng, label: selection.place.label });
      return;
    }
    const target = selection.kind === "client"
      ? clients.find((client) => client.clientId === selection.client.id)
      : clients.find((client) => client.id === selection.animal.id);
    if (!target) return;
    setSelectedId(target.id);
    if (target.coordinates) focusOn(target.coordinates.lat, target.coordinates.lng, 14, target.id);
  }

  function handleMapClick(lat: number, lng: number) {
    if (!perimeterMode) return;
    setPerimeterCenter({ lat, lng, label: "Point personnalisé" });
  }

  function togglePerimeterMode() {
    setPerimeterMode((current) => !current);
  }

  function clearPerimeter() {
    setPerimeterCenter(null);
    setPerimeterMode(false);
  }

  return (
    <div className="space-y-6">
      <Card className="p-4 sm:p-5">
        <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.75fr)_minmax(0,1.25fr)] xl:items-end">
          <UnifiedSearch onSelect={handleUnifiedSelect} onSubmitFreeText={setQuery} />

          <div className="space-y-3">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <span className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Espèce</span>
              <div className="flex flex-wrap gap-1.5">
                {speciesFilters.map((filter) => (
                  <button key={filter} type="button" onClick={() => setSpeciesFilter(filter)} aria-pressed={speciesFilter === filter} className={`flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${speciesFilter === filter ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>
                    {filter !== "Tous les clients" ? <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, filter) }} /> : null}
                    {filter}
                  </button>
                ))}
                <button type="button" onClick={() => setDueOnly((current) => !current)} aria-pressed={dueOnly} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${dueOnly ? "bg-animeo-accent text-animeo-dark" : "bg-[#fff9ec] text-[#a66d16]"}`}>À relancer</button>
              </div>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <label htmlFor="city-filter" className="w-14 shrink-0 text-xs font-extrabold text-animeo-muted">Ville</label>
              <select id="city-filter" value={cityFilter} onChange={(event) => setCityFilter(event.target.value)} className="h-10 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo">
                <option>Toutes les villes</option>
                {cities.map((city) => <option key={city}>{city}</option>)}
              </select>
              <span className="text-xs font-bold text-animeo-muted">{visibleClients.length} client{visibleClients.length > 1 ? "s" : ""} visible{visibleClients.length > 1 ? "s" : ""}</span>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-end gap-2 border-t border-[#e5eeeb] pt-5">
          <div className="flex flex-col gap-2">
            <span className="text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Périmètre</span>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={togglePerimeterMode} aria-pressed={perimeterMode} className={`rounded-xl px-3 py-2.5 text-xs font-extrabold transition ${perimeterMode ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft hover:text-animeo-dark"}`}>
                {perimeterMode ? "Cliquez sur la carte…" : "Créer un périmètre"}
              </button>
              <select value={perimeterRadiusKm} onChange={(event) => setPerimeterRadiusKm(Number(event.target.value))} className="h-10 rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3 text-xs font-extrabold text-animeo-dark outline-none focus:border-animeo" aria-label="Rayon du périmètre en kilomètres">
                {radiusOptions.map((km) => <option key={km} value={km}>{km} km</option>)}
              </select>
              {perimeterCenter ? <button type="button" onClick={clearPerimeter} className="rounded-xl bg-[#fff0eb] px-3 py-2.5 text-xs font-extrabold text-[#a9573b] transition hover:bg-[#ffe5dc]">Effacer</button> : null}
            </div>
          </div>
        </div>

        {perimeterCenter ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-animeo-soft px-4 py-3 text-sm text-animeo-dark">
            <Icon name="map" className="h-5 w-5 shrink-0 text-animeo" />
            <p><strong>{clientsInPerimeter.length} client{clientsInPerimeter.length > 1 ? "s" : ""}</strong> dans un rayon de <strong>{perimeterRadiusKm} km</strong> autour de <strong>{perimeterCenter.label}</strong>. Utile pour évaluer la création d’une nouvelle tournée.</p>
          </div>
        ) : perimeterMode ? (
          <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#fff9ec] px-4 py-3 text-sm font-bold text-[#8c6118]">
            <Icon name="map" className="h-5 w-5 shrink-0" />
            <p>Cliquez sur un point de la carte, ou choisissez un lieu ci-dessus, pour définir le centre du périmètre.</p>
          </div>
        ) : null}
      </Card>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.6fr)_360px]">
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
          <RealMap
            points={points}
            selectedId={selectedClient?.id}
            onSelect={setSelectedId}
            heightClassName="h-[610px]"
            overlay={selectedClient ? <MapClientPopup client={selectedClient} /> : undefined}
            circle={perimeterCenter ? { lat: perimeterCenter.lat, lng: perimeterCenter.lng, radiusKm: perimeterRadiusKm } : null}
            focus={focus}
            onMapClick={handleMapClick}
            crosshair={perimeterMode}
          />
        </Card>

        <Card className="overflow-hidden xl:sticky xl:top-6">
          <div className="border-b border-[#e5eeeb] px-5 py-4">
            <h2 className="font-extrabold text-animeo-dark">Clients visibles</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">{perimeterCenter ? "Filtrés par périmètre" : "Sélection synchronisée avec la carte"}</p>
          </div>
          {visibleClients.length > 0 ? (
            <div className="max-h-[650px] divide-y divide-[#edf2f0] overflow-y-auto">
              {visibleClients.map((client) => (
                <button key={client.id} type="button" onClick={() => setSelectedId(client.id)} className={`flex w-full items-center gap-3 p-4 text-left transition ${selectedClient?.id === client.id ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}>
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl shadow-sm" style={{ backgroundColor: `color-mix(in srgb, ${resolveSpeciesColor(theme.speciesColors, client.species)} 18%, white)` }}>{client.avatar}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-extrabold text-animeo-dark">{client.ownerName}</span>
                    <span className="mt-0.5 block truncate text-xs font-bold text-animeo-muted">{client.animalName} · {client.species}</span>
                    <span className="mt-1 block truncate text-[10px] text-animeo-muted">
                      {client.city} · {client.lastConsultation}
                      {!client.coordinates ? <span className="ml-1.5 font-bold text-[#a9573b]">· Position inconnue</span> : null}
                    </span>
                  </span>
                  {client.dueForReminder ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-animeo-accent" title="À relancer" /> : null}
                </button>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center"><Icon name="map" className="mx-auto h-8 w-8 text-animeo-muted" /><p className="mt-3 text-sm font-bold text-animeo-muted">Aucun client ne correspond aux filtres.</p></div>
          )}
        </Card>
      </div>

      <div className="rounded-2xl border border-[#cfe7e1] bg-animeo-soft px-4 py-3 text-xs font-semibold leading-relaxed text-animeo-dark">
        Carte OpenStreetMap avec positions réelles. Itinéraires optimisés prévus en V2.
      </div>
    </div>
  );
}

function MapClientPopup({ client }: { client: MapClient }) {
  const { theme } = useDashboardTheme();
  return (
    <div className="rounded-2xl border border-white/70 bg-white/95 p-4 shadow-[0_12px_30px_rgba(24,59,69,0.18)] backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-2xl" style={{ backgroundColor: `color-mix(in srgb, ${resolveSpeciesColor(theme.speciesColors, client.species)} 22%, white)` }}>{client.avatar}</span>
        <div className="min-w-0">
          <h3 className="truncate font-black text-animeo-dark">{client.ownerName}</h3>
          <p className="mt-0.5 text-xs font-extrabold text-animeo">{client.animalName}</p>
          <p className="text-[10px] font-semibold text-animeo-muted">{client.species} · {client.breed}</p>
        </div>
      </div>
      <dl className="mt-3 space-y-1.5 text-[11px]">
        <PopupLine label="Ville" value={client.city} />
        <PopupLine label="Dernière consultation" value={client.lastConsultation} />
        <PopupLine label="Prochain rappel" value={client.nextReminder} />
      </dl>
      <Link href={`/dashboard/clients/${client.clientId}`} className="mt-4 flex w-full items-center justify-center rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#459e90]">Voir la fiche client</Link>
    </div>
  );
}

function PopupLine({ label, value }: { label: string; value: string }) {
  return <div className="flex items-start justify-between gap-3"><dt className="text-animeo-muted">{label}</dt><dd className="text-right font-extrabold text-animeo-dark">{value}</dd></div>;
}
