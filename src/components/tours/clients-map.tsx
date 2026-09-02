"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
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

type ClientsMapProps = {
  clients: MapClient[];
};

type PerimeterCenter = { lat: number; lng: number; label: string };
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

export function ClientsMap({ clients }: ClientsMapProps) {
  const { theme } = useDashboardTheme();
  const [selectedSpecies, setSelectedSpecies] = useState<AnimalSpecies[]>([]);
  const [speciesPanelOpen, setSpeciesPanelOpen] = useState(false);
  const [dueOnly, setDueOnly] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(clients[0]?.id ?? "");

  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom: number; token: string } | null>(null);
  const [perimeterCenter, setPerimeterCenter] = useState<PerimeterCenter | null>(null);
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

  function clearPerimeter() {
    setPerimeterCenter(null);
    setRadiusPanelOpen(false);
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
  }

  // Pendant un glisser, seule la valeur en direct (pour le cercle, le jeton
  // et les paliers) change ; au relâchement (phase "commit"), la valeur est
  // arrondie à 5 km — jamais de nouvel appel réseau ici, le filtrage par
  // périmètre est déjà entièrement local (voir clientsInPerimeter).
  function handleCircleRadiusChange(radiusKm: number, phase: "drag" | "commit") {
    if (phase === "commit") setPerimeterRadiusKm(Math.max(5, Math.round(radiusKm / 5) * 5));
    else setPerimeterRadiusKm(radiusKm);
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

  const clientsInPerimeter = useMemo(() => {
    if (!perimeterCenter) return filteredClients;
    // Un client sans coordonnées ne peut pas être comparé à un centre de
    // périmètre : exclu plutôt que deviné.
    return filteredClients.filter((client) => client.coordinates && haversineDistanceKm(perimeterCenter, client.coordinates) <= perimeterRadiusKm);
  }, [filteredClients, perimeterCenter, perimeterRadiusKm]);

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
  // périmètre : le seul moyen d'en définir un depuis la phase 2 (l'ancien
  // "Créer un périmètre" + clic sur la carte, qui laissait deviner un point
  // sans coordonnées vérifiées, a été retiré).
  function handleUnifiedSelect(selection: UnifiedSearchSelection) {
    if (selection.kind === "place") {
      focusOn(selection.place.lat, selection.place.lng, selection.place.zoom, selection.place.id);
      setPerimeterCenter({ lat: selection.place.lat, lng: selection.place.lng, label: selection.place.label });
      setPerimeterRadiusExternally(DEFAULT_PERIMETER_RADIUS_KM);
      return;
    }
    // "zone"/"address" jamais sélectionnables ici : cette carte n'active
    // que client/animal/place (voir sources={...} sur <UnifiedSearch>).
    if (selection.kind !== "client" && selection.kind !== "animal") return;
    const target = selection.kind === "client"
      ? clients.find((client) => client.clientId === selection.client.id)
      : clients.find((client) => client.id === selection.animal.id);
    if (!target) return;
    setSelectedId(target.id);
    if (target.coordinates) focusOn(target.coordinates.lat, target.coordinates.lng, 14, target.id);
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
          <div className="min-w-0 sm:flex-1"><UnifiedSearch onSelect={handleUnifiedSelect} onSubmitFreeText={setQuery} sources={["client", "animal", "place"]} /></div>

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
                <div role="group" aria-label="Filtrer par espèce" className="absolute right-0 z-20 mt-1.5 w-56 rounded-xl border border-[#d9e5e2] bg-white p-1.5 shadow-[0_14px_35px_rgba(24,59,69,0.15)]">
                  {animalSpeciesList.map((species) => (
                    <label key={species} className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-sm font-bold text-animeo-dark transition hover:bg-animeo-bg">
                      <input type="checkbox" checked={selectedSpecies.includes(species)} onChange={() => toggleSpecies(species)} className="h-4 w-4 shrink-0 rounded border-[#c7d6d2] text-animeo focus:ring-animeo" />
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
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-xs font-extrabold transition ${dueOnly ? "bg-animeo-accent text-animeo-dark" : "bg-[#fff9ec] text-[#a66d16] hover:bg-[#fff3d9]"}`}
            >
              <Icon name="bell" className="h-3.5 w-3.5" />
              À relancer
            </button>

            <span key={visibleClients.length} className="animate-count-pulse inline-block text-xs font-bold text-animeo-muted">
              {visibleClients.length} client{visibleClients.length > 1 ? "s" : ""}
            </span>
          </div>
        </div>

        {activeFilterTokens.length > 0 || perimeterCenter ? (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[#e5eeeb] pt-3">
            {activeFilterTokens.map((token) => (
              <button key={token.key} type="button" onClick={token.onRemove} className="inline-flex min-h-11 items-center gap-1.5 rounded-xl bg-animeo-soft px-3 text-xs font-extrabold text-animeo-dark transition hover:bg-[#d9ece7]">
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
                    className="inline-flex items-center gap-1 px-3 transition hover:bg-[#d9ece7]"
                  >
                    {Math.round(perimeterRadiusKm)} km autour de {perimeterCenter.label}
                    <ChevronIcon />
                  </button>
                  <button type="button" onClick={clearPerimeter} aria-label="Retirer le filtre de périmètre" className="inline-flex items-center px-2.5 text-animeo-muted transition hover:bg-[#d9ece7] hover:text-animeo-dark">×</button>
                </div>
                {radiusPanelOpen ? (
                  <div role="group" aria-label="Choisir le rayon du périmètre" className="absolute z-20 mt-1.5 w-56 rounded-xl border border-[#d9e5e2] bg-white p-1.5 shadow-[0_14px_35px_rgba(24,59,69,0.15)]">
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
            circleHandle={showCircleHandle}
            onCircleRadiusChange={handleCircleRadiusChange}
            circleHandleResetKey={circleHandleResetKey}
            focus={focus}
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
