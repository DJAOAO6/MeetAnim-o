"use client";

import { useEffect, useId, useRef, useState } from "react";
import { bookingInputClassName } from "@/components/booking/booking-ui";
import type { AddressSearchResponse, GeocodedAddress } from "@/data/geocoding";

type AddressAutocompleteProps = {
  id?: string;
  value: string;
  placeholder?: string;
  required?: boolean;
  onQueryChange: (value: string) => void;
  onSelect: (result: GeocodedAddress) => void;
  // Permet aux contextes hors réservation publique (dashboard, paramètres)
  // de réutiliser ce composant avec leur propre style d'input plutôt que
  // celui de la page de réservation.
  inputClassName?: string;
};

const MIN_CHARS = 3;
const DEBOUNCE_MS = 300;

export function AddressAutocomplete({ id, value, placeholder, required, onQueryChange, onSelect, inputClassName = bookingInputClassName }: AddressAutocompleteProps) {
  const [results, setResults] = useState<GeocodedAddress[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [unavailable, setUnavailable] = useState(false);
  const [searched, setSearched] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skipNextSearchRef = useRef(false);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;

  useEffect(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }

    const trimmed = value.trim();

    const timer = setTimeout(() => {
      if (trimmed.length < MIN_CHARS) {
        abortRef.current?.abort();
        setResults([]);
        setOpen(false);
        setUnavailable(false);
        setSearched(false);
        setLoading(false);
        return;
      }

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);

      fetch(`/api/address-search?q=${encodeURIComponent(trimmed)}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error("address search request failed");
          return response.json() as Promise<AddressSearchResponse>;
        })
        .then((data) => {
          const results = Array.isArray(data?.results) ? data.results : [];
          setResults(results);
          setOpen(results.length > 0);
          setActiveIndex(-1);
          setUnavailable(results.length === 0 && "error" in data && Boolean(data.error));
          setSearched(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError") return;
          setResults([]);
          setOpen(false);
          setUnavailable(true);
          setSearched(true);
        })
        .finally(() => setLoading(false));
    }, trimmed.length < MIN_CHARS ? 0 : DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [value]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function handleSelect(result: GeocodedAddress) {
    skipNextSearchRef.current = true;
    abortRef.current?.abort();
    setOpen(false);
    setResults([]);
    setActiveIndex(-1);
    setSearched(false);
    onQueryChange(result.label);
    onSelect(result);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open || results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, results.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      if (activeIndex >= 0) {
        event.preventDefault();
        handleSelect(results[activeIndex]);
      }
    } else if (event.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-autocomplete="list"
          autoComplete="off"
          value={value}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => { if (results.length > 0) setOpen(true); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ? `${placeholder}…` : undefined}
          required={required}
          className={`${inputClassName} touch-manipulation pr-10`}
        />
        {loading ? (
          <span aria-hidden="true" className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2">
            <span className="block h-4 w-4 animate-spin rounded-full border-2 border-animeo/25 border-t-animeo" />
          </span>
        ) : null}
      </div>

      {open && results.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Suggestions d’adresse" className="absolute z-30 mt-1.5 w-full overflow-hidden rounded-xl border border-[#d7e4e1] bg-white py-1 shadow-[0_12px_32px_rgba(24,59,69,0.14)]">
          {results.map((result, index) => (
            <li
              key={result.id}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => { event.preventDefault(); handleSelect(result); }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`touch-manipulation cursor-pointer truncate px-4 py-3 text-sm font-semibold leading-snug text-animeo-dark transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
            >
              {result.label}
            </li>
          ))}
        </ul>
      ) : null}

      {unavailable ? (
        <p className="mt-1.5 text-xs text-animeo-muted">Suggestions indisponibles pour le moment — vous pouvez saisir votre adresse manuellement.</p>
      ) : searched && !loading && results.length === 0 ? (
        <p className="mt-1.5 text-xs text-animeo-muted">Aucune adresse trouvée — vous pouvez la saisir manuellement ci-dessous.</p>
      ) : null}

      <span aria-live="polite" className="sr-only">
        {loading ? "Recherche d’adresses en cours…" : unavailable ? "Suggestions indisponibles" : searched ? `${results.length} suggestion${results.length > 1 ? "s" : ""} trouvée${results.length > 1 ? "s" : ""}` : ""}
      </span>
    </div>
  );
}
