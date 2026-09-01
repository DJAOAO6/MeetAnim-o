"use client";

import { useEffect, useId, useRef, useState } from "react";
import { searchClientsAndAnimalsAction, type AnimalSearchResult, type ClientSearchResult } from "@/lib/clients-actions";
import { searchPlaces, type PlaceResult } from "@/lib/geo-search";
import { resolveSpeciesColor } from "@/data/species";
import { useDashboardTheme } from "@/components/theme/dashboard-theme-provider";

/**
 * Recherche unifiée (carte clients, future palette CTRL+K — voir le prompt
 * dédié) : un seul champ, une liste de résultats groupée par type, et c'est
 * la SÉLECTION d'un résultat qui détermine l'action, jamais une devinette sur
 * ce que l'utilisatrice a tapé. Le comportement de sélection (`onSelect`)
 * est fourni par l'appelant — ce composant ne connaît ni la carte, ni la
 * palette qui l'utilisera un jour, uniquement la recherche elle-même.
 */

export type UnifiedSearchSelection =
  | { kind: "client"; client: ClientSearchResult }
  | { kind: "animal"; animal: AnimalSearchResult }
  | { kind: "place"; place: PlaceResult };

type UnifiedSearchProps = {
  onSelect: (selection: UnifiedSearchSelection) => void;
  // Texte libre validé (Entrée) sans sélection dans la liste : ne filtre
  // jamais les lieux (un lieu sans coordonnées ne permet aucun calcul de
  // rayon — il doit être choisi explicitement dans la liste).
  onSubmitFreeText: (text: string) => void;
  placeholder?: string;
  className?: string;
};

const MIN_CHARS = 2;
const PLACE_DEBOUNCE_MS = 250;
// Rayon par défaut annoncé dans la seconde ligne des résultats "Lieux" — le
// réglage par palier (15/30/50 km) n'existe qu'à partir de la phase 3 de ce
// chantier ; 15 km reste la valeur par défaut du filtre de périmètre.
const DEFAULT_PERIMETER_RADIUS_KM = 15;

type FlatOption =
  | { kind: "place"; data: PlaceResult }
  | { kind: "client"; data: ClientSearchResult }
  | { kind: "animal"; data: AnimalSearchResult };

const placeTypeLabels: Record<PlaceResult["type"], string> = { commune: "Ville / village", departement: "Département", region: "Région" };

export function UnifiedSearch({ onSelect, onSubmitFreeText, placeholder = "Rechercher un client, un animal ou un lieu", className }: UnifiedSearchProps) {
  const { theme } = useDashboardTheme();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  const [clients, setClients] = useState<ClientSearchResult[]>([]);
  const [animals, setAnimals] = useState<AnimalSearchResult[]>([]);
  const localRequestRef = useRef(0);

  const [placeResults, setPlaceResults] = useState<PlaceResult[]>([]);
  const [placeLoading, setPlaceLoading] = useState(false);
  const placeAbortRef = useRef<AbortController | null>(null);
  const placeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;

  const trimmed = value.trim();
  const showResults = trimmed.length >= MIN_CHARS;

  // Requête locale (clients/animaux) : part à chaque caractère à partir de 2
  // caractères, jamais bloquée sur la recherche de lieu (réseau, plus
  // lente) — un garde par identifiant de requête plutôt qu'un
  // AbortController, une Server Action n'exposant pas d'annulation externe.
  useEffect(() => {
    if (!showResults) {
      // queueMicrotask : évite d'appeler setState de façon synchrone au
      // corps de l'effet (même convention que schedule-step.tsx et
      // src/components/clients/client-profile.tsx).
      queueMicrotask(() => { setClients([]); setAnimals([]); });
      return;
    }
    const requestId = ++localRequestRef.current;
    searchClientsAndAnimalsAction(trimmed).then((result) => {
      if (requestId !== localRequestRef.current) return;
      setClients(result.clients);
      setAnimals(result.animals);
    });
  }, [trimmed, showResults]);

  // Recherche de lieu : débattue ~250ms, annule la précédente à chaque
  // frappe — jamais de quoi ralentir la recherche locale ci-dessus.
  useEffect(() => {
    if (placeDebounceRef.current) clearTimeout(placeDebounceRef.current);
    placeAbortRef.current?.abort();
    if (!showResults) {
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
  }, [trimmed, showResults]);

  useEffect(() => {
    return () => { placeAbortRef.current?.abort(); };
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const flatOptions: FlatOption[] = [
    ...placeResults.map((data): FlatOption => ({ kind: "place", data })),
    ...clients.map((data): FlatOption => ({ kind: "client", data })),
    ...animals.map((data): FlatOption => ({ kind: "animal", data })),
  ];
  // Index à plat de chaque groupe (navigation clavier continue à travers les
  // groupes) : des décalages précalculés plutôt qu'un compteur muté pendant
  // le rendu des trois listes ci-dessous.
  const placeOptionOffset = 0;
  const clientOptionOffset = placeResults.length;
  const animalOptionOffset = clientOptionOffset + clients.length;

  function selectOption(option: FlatOption) {
    setOpen(false);
    setActiveIndex(-1);
    if (option.kind === "place") {
      setValue(option.data.label);
      onSelect({ kind: "place", place: option.data });
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

  const showPlacesGroup = showResults && (placeLoading || placeResults.length > 0);
  const showClientsGroup = showResults && clients.length > 0;
  const showAnimalsGroup = showResults && animals.length > 0;
  const hasAnyGroup = showPlacesGroup || showClientsGroup || showAnimalsGroup;

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
          {showPlacesGroup ? (
            <div role="group" aria-label="Lieux · définir un périmètre">
              <GroupLabel>Lieux · définir un périmètre</GroupLabel>
              {placeLoading && placeResults.length === 0 ? (
                <p className="px-4 py-2.5 text-xs font-semibold text-animeo-muted">Recherche…</p>
              ) : (
                placeResults.map((place, position) => {
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
                      <span className="text-xs font-semibold text-animeo-muted">Clients à moins de {DEFAULT_PERIMETER_RADIUS_KM} km</span>
                    </button>
                  );
                })
              )}
            </div>
          ) : null}

          {showClientsGroup ? (
            <div role="group" aria-label="Clients">
              <GroupLabel>Clients</GroupLabel>
              {clients.map((client, position) => {
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
              {animals.map((animal, position) => {
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
