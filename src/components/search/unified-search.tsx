"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchClientsAndAnimalsAction, type AnimalSearchResult, type ClientSearchResult } from "@/lib/clients-actions";
import { searchPlaces, type PlaceResult } from "@/lib/geo-search";
import { searchZonesAction, type ZoneSearchResult } from "@/lib/tours-actions";
import { resolveSpeciesColor } from "@/data/species";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";
import type { AddressSearchResponse, GeocodedAddress } from "@/data/geocoding";

/**
 * Recherche unifiée (carte clients, écrans de tournées, future palette
 * CTRL+K — voir PROMPT-TOURNEES-UNIFICATION.md, phase 3 quater) : un seul
 * champ, une liste de résultats groupée par type, et c'est la SÉLECTION
 * d'un résultat qui détermine l'action, jamais une devinette sur ce que
 * l'utilisatrice a tapé. Le comportement de sélection (`onSelect`) est
 * fourni par l'appelant — ce composant ne connaît ni la carte, ni la
 * tournée, ni la palette qui l'utilisera un jour, uniquement la recherche
 * elle-même. Les sources actives se choisissent par la prop `sources` —
 * un écran qui n'a besoin que d'adresses n'active que celle-là, il ne
 * réimplémente rien.
 */

export type UnifiedSearchSource = "client" | "animal" | "place" | "zone" | "address";

export type UnifiedSearchSelection =
  | { kind: "client"; client: ClientSearchResult }
  | { kind: "animal"; animal: AnimalSearchResult }
  | { kind: "place"; place: PlaceResult }
  | { kind: "zone"; zone: ZoneSearchResult }
  | { kind: "address"; address: GeocodedAddress };

type UnifiedSearchProps = {
  onSelect: (selection: UnifiedSearchSelection) => void;
  // Texte libre validé (Entrée) sans sélection dans la liste : ne filtre
  // jamais les lieux (un lieu sans coordonnées ne permet aucun calcul de
  // rayon — il doit être choisi explicitement dans la liste).
  onSubmitFreeText: (text: string) => void;
  placeholder?: string;
  className?: string;
  // Préremplit le champ (ex. la ville déjà enregistrée en modifiant une
  // zone existante) — lu une seule fois au montage, comme un
  // defaultValue natif : ce composant reste "à sélection", pas contrôlé.
  defaultValue?: string;
  // Toutes les sources par défaut — un écran qui n'a besoin que d'un
  // sous-ensemble (ex. adresses seules pour un endpoint de tournée) le
  // précise ici plutôt que de filtrer les résultats après coup.
  sources?: UnifiedSearchSource[];
  // Restreint la source "place" à certains types (ex. seulement les
  // communes pour choisir une ville de zone, jamais un département/une
  // région) — tous les types par défaut.
  placeTypes?: PlaceResult["type"][];
};

const ALL_SOURCES: UnifiedSearchSource[] = ["client", "animal", "place", "zone", "address"];
const ALL_PLACE_TYPES: PlaceResult["type"][] = ["commune", "departement", "region"];
const MIN_CHARS = 2;
const PLACE_DEBOUNCE_MS = 250;
const ADDRESS_DEBOUNCE_MS = 300;
const ADDRESS_MIN_CHARS = 3;
// Rayon par défaut annoncé dans la seconde ligne des résultats "Lieux" — le
// réglage par palier (15/30/50 km) n'existe qu'à partir de la phase 3 de ce
// chantier ; 15 km reste la valeur par défaut du filtre de périmètre.
const DEFAULT_PERIMETER_RADIUS_KM = 15;

type FlatOption =
  | { kind: "place"; data: PlaceResult }
  | { kind: "zone"; data: ZoneSearchResult }
  | { kind: "client"; data: ClientSearchResult }
  | { kind: "animal"; data: AnimalSearchResult }
  | { kind: "address"; data: GeocodedAddress };

const placeTypeLabels: Record<PlaceResult["type"], string> = { commune: "Ville / village", departement: "Département", region: "Région" };

export function UnifiedSearch({ onSelect, onSubmitFreeText, placeholder = "Rechercher un client, un animal ou un lieu", className, sources = ALL_SOURCES, placeTypes = ALL_PLACE_TYPES, defaultValue = "" }: UnifiedSearchProps) {
  const { theme } = useDashboardTheme();
  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const wantsClients = sources.includes("client") || sources.includes("animal");
  const wantsPlaces = sources.includes("place");
  const wantsZones = sources.includes("zone");
  const wantsAddresses = sources.includes("address");

  const [clients, setClients] = useState<ClientSearchResult[]>([]);
  const [animals, setAnimals] = useState<AnimalSearchResult[]>([]);
  const localRequestRef = useRef(0);

  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const placeAbortRef = useRef<AbortController | null>(null);
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [zoneResults, setZoneResults] = useState<ZoneSearchResult[]>([]);
  const zoneRequestRef = useRef(0);

  const [addressResults, setAddressResults] = useState<GeocodedAddress[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const addressAbortRef = useRef<AbortController | null>(null);
  const addressDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;

  const trimmed = value.trim();
  const showResults = trimmed.length >= MIN_CHARS;
  // Clients et animaux partagent une seule requête (searchClientsAndAnimalsAction
  // renvoie toujours les deux) — mais un appelant peut n'en vouloir qu'un des
  // deux affiché (ex. "animal" seul pour rattacher un rendez-vous à un
  // arrêt) : le filtre d'affichage est donc distinct du déclenchement de la
  // requête (wantsClients ci-dessous).
  const visibleClients = sources.includes("client") ? clients : [];
  const visibleAnimals = sources.includes("animal") ? animals : [];

  // Requête locale (clients/animaux) : part à chaque caractère à partir de 2
  // caractères, jamais bloquée sur la recherche de lieu (réseau, plus
  // lente) — un garde par identifiant de requête plutôt qu'un
  // AbortController, une Server Action n'exposant pas d'annulation externe.
  useEffect(() => {
    if (!wantsClients || !showResults) {
      queueMicrotask(() => { setClients([]); setAnimals([]); });
      return;
    }
    const requestId = ++localRequestRef.current;
    searchClientsAndAnimalsAction(trimmed).then((result) => {
      if (requestId !== localRequestRef.current) return;
      setClients(result.clients);
      setAnimals(result.animals);
    });
  }, [trimmed, showResults, wantsClients]);

  // Recherche de zones : même garde par identifiant que clients/animaux —
  // une Server Action, pas d'AbortController externe possible.
  useEffect(() => {
    if (!wantsZones || !showResults) {
      queueMicrotask(() => setZoneResults([]));
      return;
    }
    const requestId = ++zoneRequestRef.current;
    searchZonesAction(trimmed).then((results) => {
      if (requestId !== zoneRequestRef.current) return;
      setZoneResults(results);
    });
  }, [trimmed, showResults, wantsZones]);

  // Recherche de lieu (communes/départements/régions) : débattue ~250ms,
  // annule la précédente à chaque frappe.
  useEffect(() => {
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    placeAbortRef.current?.abort();
    if (!wantsPlaces || !showResults) {
      queueMicrotask(() => { setPlaceResults([]); setPlaceLoading(false); });
      return;
    }
    queueMicrotask(() => setPlaceLoading(true));
    placeDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      placeAbortRef.current = controller;
      searchPlaces(trimmed, controller.signal)
        .then((results) => { if (!controller.signal.aborted) setPlaceResults(results); })
        .finally(() => { if (!controller.signal.aborted) setPlaceLoading(false); });
    }, PLACE_DEBOUNCE_MS);
    return () => { if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current); };
  }, [trimmed, showResults, wantsPlaces]);

  // Filtre d'affichage (ex. seulement les communes pour une ville de zone) —
  // à chaque rendu plutôt que dans l'effet ci-dessus : ne doit jamais
  // relancer la requête réseau, juste réduire ce qui est proposé.
  const visiblePlaceResults = placeResults.filter((place) => placeTypes.includes(place.type));

  // Recherche d'adresses précises (Géoplateforme IGN, /api/address-search) —
  // même route et même logique de débounce/annulation qu'AddressAutocomplete
  // (src/components/ui/address-autocomplete.tsx), pas réécrite ici.
  useEffect(() => {
    if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current);
    addressAbortRef.current?.abort();
    if (!wantsAddresses || trimmed.length < ADDRESS_MIN_CHARS) {
      queueMicrotask(() => { setAddressResults([]); setAddressLoading(false); });
      return;
    }
    queueMicrotask(() => setAddressLoading(true));
    addressDebounceRef.current = setTimeout(() => {
      const controller = new AbortController();
      addressAbortRef.current = controller;
      fetch(`/api/address-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then((response) => (response.ok ? (response.json() as Promise<AddressSearchResponse>) : { results: [] }))
        .then((data) => { if (!controller.signal.aborted) setAddressResults(data.results); })
        .catch(() => { if (!controller.signal.aborted) setAddressResults([]); })
        .finally(() => { if (!controller.signal.aborted) setAddressLoading(false); });
    }, ADDRESS_DEBOUNCE_MS);
    return () => { if (addressDebounceRef.current) clearTimeout(addressDebounceRef.current); };
  }, [trimmed, wantsAddresses]);

  useEffect(() => {
    return () => { placeAbortRef.current?.abort(); addressAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const flatOptions: FlatOption[] = [
    ...visibleClients.map((data): FlatOption => ({ kind: "client", data })),
    ...visibleAnimals.map((data): FlatOption => ({ kind: "animal", data })),
    ...zoneResults.map((data): FlatOption => ({ kind: "zone", data })),
    ...visiblePlaceResults.map((data): FlatOption => ({ kind: "place", data })),
    ...addressResults.map((data): FlatOption => ({ kind: "address", data })),
  ];
  // Index à plat de chaque groupe (navigation clavier continue à travers les
  // groupes) : des décalages précalculés plutôt qu'un compteur muté pendant
  // le rendu des listes ci-dessous.
  const clientOptionOffset = 0;
  const animalOptionOffset = clientOptionOffset + visibleClients.length;
  const zoneOptionOffset = animalOptionOffset + visibleAnimals.length;
  const placeOptionOffset = zoneOptionOffset + zoneResults.length;
  const addressOptionOffset = placeOptionOffset + visiblePlaceResults.length;

  function selectOption(option: FlatOption) {
    setOpen(false);
    setActiveIndex(-1);
    if (option.kind === "place") {
      setValue(option.data.label);
      onSelect({ kind: "place", place: option.data });
    } else if (option.kind === "zone") {
      setValue(option.data.name);
      onSelect({ kind: "zone", zone: option.data });
    } else if (option.kind === "address") {
      setValue(option.data.label);
      onSelect({ kind: "address", address: option.data });
    } else if (option.kind === "client") {
      setValue("");
      onSelect({ kind: "client", client: option.data });
    } else {
      setValue("");
      onSelect({ kind: "animal", animal: option.data });
    }
  }

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    setValue(event.target.value);
    setOpen(true);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (flatOptions.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((current) => Math.min(current + 1, flatOptions.length - 1));
    } else if (event.key === "ArrowUp") {
      if (flatOptions.length === 0) return;
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0 && activeIndex < flatOptions.length) {
        selectOption(flatOptions[activeIndex]);
      } else if (trimmed.length > 0) {
        setOpen(false);
        onSubmitFreeText(trimmed);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  const showClientsGroup = showResults && visibleClients.length > 0;
  const showAnimalsGroup = showResults && visibleAnimals.length > 0;
  const showZonesGroup = showResults && zoneResults.length > 0;
  const showPlacesGroup = showResults && (placeLoading || visiblePlaceResults.length > 0);
  const showAddressesGroup = wantsAddresses && trimmed.length >= ADDRESS_MIN_CHARS && (addressLoading || addressResults.length > 0);
  const hasAnyGroup = showClientsGroup || showAnimalsGroup || showZonesGroup || showPlacesGroup || showAddressesGroup;

  return (
    <div ref={containerRef} className={`relative z-50 ${className ?? ""}`}>
      <div className="relative">
        <SearchIcon />
        <input
          type="text"
          role="combobox"
          aria-expanded={open && hasAnyGroup}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          onChange={handleChange}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg pl-10 pr-4 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:bg-white"
        />
      </div>

      {open && hasAnyGroup ? (
        <div id={listboxId} role="listbox" aria-label="Résultats de recherche" className="absolute z-[700] mt-1.5 max-h-96 w-full overflow-y-auto rounded-xl border border-[#d9e5e2] bg-white py-1.5 shadow-[0_14px_35px_rgba(24,59,69,0.15)]">
          {showClientsGroup ? (
            <div role="group" aria-label="Clients">
              <GroupLabel>Clients</GroupLabel>
              {visibleClients.map((client, position) => {
                const index = clientOptionOffset + position;
                return (
                  <button
                    key={client.id}
                    type="button"
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => { event.preventDefault(); selectOption({ kind: "client", data: client }); }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
                  >
                    <span className="text-sm font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</span>
                    <span className="text-xs font-semibold text-animeo-muted">{client.address} · {client.city}</span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {showAnimalsGroup ? (
            <div role="group" aria-label="Animaux">
              <GroupLabel>Animaux</GroupLabel>
              {visibleAnimals.map((animal, position) => {
                const index = animalOptionOffset + position;
                return (
                  <button
                    key={animal.id}
                    type="button"
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => { event.preventDefault(); selectOption({ kind: "animal", data: animal }); }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full items-center gap-2 px-4 py-2.5 text-left transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: resolveSpeciesColor(theme.speciesColors, animal.species) }} />
                    <span className="min-w-0">
                      <span className="block text-sm font-extrabold text-animeo-dark">{animal.name} <span className="font-semibold text-animeo-muted">· {animal.species}</span></span>
                      <span className="block text-xs font-semibold text-animeo-muted">{animal.ownerName}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {showZonesGroup ? (
            <div role="group" aria-label="Zones">
              <GroupLabel>Zones</GroupLabel>
              {zoneResults.map((zone, position) => {
                const index = zoneOptionOffset + position;
                return (
                  <button
                    key={zone.id}
                    type="button"
                    id={`${listboxId}-option-${index}`}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseDown={(event) => { event.preventDefault(); selectOption({ kind: "zone", data: zone }); }}
                    onMouseEnter={() => setActiveIndex(index)}
                    className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
                  >
                    <span className="text-sm font-extrabold text-animeo-dark">{zone.name}</span>
                    <span className="text-xs font-semibold text-animeo-muted">
                      {zone.matchedCity ? `via ${zone.matchedCity} · ` : ""}{zone.cityCount} ville{zone.cityCount > 1 ? "s" : ""}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : null}

          {showPlacesGroup ? (
            <div role="group" aria-label="Lieux · définir un périmètre">
              <GroupLabel>Lieux · définir un périmètre</GroupLabel>
              {placeLoading && visiblePlaceResults.length === 0 ? (
                <p className="px-4 py-2.5 text-xs font-semibold text-animeo-muted">Recherche…</p>
              ) : (
                visiblePlaceResults.map((place, position) => {
                  const index = placeOptionOffset + position;
                  return (
                    <button
                      key={place.id}
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => { event.preventDefault(); selectOption({ kind: "place", data: place }); }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
                    >
                      <span className="flex w-full items-center justify-between gap-2 text-sm font-extrabold text-animeo-dark">
                        {place.label}
                        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.08em] text-animeo-muted">{placeTypeLabels[place.type]}</span>
                      </span>
                      <span className="text-xs font-semibold text-animeo-muted">
                        {wantsClients ? `Clients à moins de ${DEFAULT_PERIMETER_RADIUS_KM} km` : place.postalCode ? `${place.postalCode} · ${place.context}` : place.context}
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}

          {showAddressesGroup ? (
            <div role="group" aria-label="Adresses">
              <GroupLabel>Adresses</GroupLabel>
              {addressLoading && addressResults.length === 0 ? (
                <p className="px-4 py-2.5 text-xs font-semibold text-animeo-muted">Recherche…</p>
              ) : (
                addressResults.map((address, position) => {
                  const index = addressOptionOffset + position;
                  return (
                    <button
                      key={address.id}
                      type="button"
                      id={`${listboxId}-option-${index}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(event) => { event.preventDefault(); selectOption({ kind: "address", data: address }); }}
                      onMouseEnter={() => setActiveIndex(index)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
                    >
                      <span className="truncate text-sm font-extrabold text-animeo-dark">{address.label}</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return <p role="presentation" className="px-4 pb-1.5 pt-2 text-[10px] font-extrabold uppercase tracking-[0.08em] text-animeo-muted">{children}</p>;
}

function SearchIcon() {
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute bottom-3 left-3.5 h-5 w-5 text-animeo-muted"><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>;
}
