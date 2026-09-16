"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { initialsFor } from "@/lib/format";
import type { ClientPickerOption } from "@/data/clients";

const MAX_RESULTS = 6;
/** Assez court pour suivre la frappe, assez long pour ne pas filtrer à chaque touche. */
const SEARCH_DEBOUNCE_MS = 150;

function normalize(value: string): string {
  // Sans accents ni casse : « eloise » doit trouver « Éloïse », et un numéro
  // saisi avec des espaces doit trouver un numéro enregistré sans.
  return value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("fr-FR");
}

function normalizePhone(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

export function matchesClient(client: ClientPickerOption, query: string): boolean {
  const normalized = normalize(query);
  const digits = normalizePhone(query);
  const haystack = normalize(`${client.firstName} ${client.lastName} ${client.email} ${client.city}`);
  const animalNames = normalize(client.animals.map((animal) => animal.name).join(" "));

  if (haystack.includes(normalized) || animalNames.includes(normalized)) return true;
  // Une recherche par chiffres ne doit pas ramener tous les clients dès le
  // premier caractère : au moins trois chiffres avant de comparer un numéro.
  return digits.length >= 3 && normalizePhone(client.phone).includes(digits);
}

/**
 * Recherche d'un client par nom, téléphone, e-mail, ville ou nom d'animal.
 *
 * Filtrage local sur la liste déjà chargée par le layout : aucune requête
 * réseau, donc aucun délai perceptible pendant un appel téléphonique. Le
 * debounce ne sert qu'à éviter de refiltrer la liste entière à chaque touche
 * — c'est une économie de rendu, pas une économie de réseau.
 *
 * Le nom d'animal est volontairement cherché lui aussi : au téléphone, on
 * entend souvent « c'est pour Rex » avant d'entendre le nom du maître.
 */
export function ClientSearch({ clients, onSelect, onCreate, onUseWithoutFile, autoFocus = false }: {
  clients: ClientPickerOption[];
  onSelect: (client: ClientPickerOption) => void;
  onCreate: (initialQuery: string) => void;
  /** Rendez-vous sans fiche client : le nom seul est enregistré. */
  onUseWithoutFile: (name: string) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  const listboxId = "client-search-results";
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timeout = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timeout);
  }, [query]);

  useEffect(() => { if (autoFocus) inputRef.current?.focus(); }, [autoFocus]);

  const results = useMemo(() => {
    const trimmed = debounced.trim();
    if (trimmed.length === 0) return [];
    return clients.filter((client) => matchesClient(client, trimmed)).slice(0, MAX_RESULTS);
  }, [clients, debounced]);

  // Ajusté pendant le rendu plutôt que dans un effet (motif React
  // recommandé, déjà utilisé dans appointments-context) : une nouvelle
  // recherche repart de la première proposition, sans rendu supplémentaire.
  const [highlightedFor, setHighlightedFor] = useState(debounced);
  if (highlightedFor !== debounced) {
    setHighlightedFor(debounced);
    setHighlighted(0);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => (current + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => (current - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      // Empêche l'envoi du formulaire : Entrée choisit le client mis en
      // évidence, elle ne crée pas le rendez-vous à moitié rempli.
      event.preventDefault();
      onSelect(results[highlighted]);
      setQuery("");
    }
  }

  const searching = debounced.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-animeo-muted" />
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={handleKeyDown}
          role="combobox"
          aria-expanded={searching && results.length > 0}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-label="Rechercher un client par nom, téléphone ou e-mail"
          placeholder="Rechercher un client par nom, téléphone ou e-mail"
          className="h-11 w-full rounded-xl border border-animeo-border bg-animeo-bg pl-10 pr-10 text-sm font-semibold text-animeo-dark outline-none transition placeholder:text-animeo-subtle focus:border-animeo focus:bg-white"
        />
        {query ? (
          <button
            type="button"
            onClick={() => { setQuery(""); inputRef.current?.focus(); }}
            aria-label="Effacer la recherche"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-animeo-muted transition hover:bg-animeo-bg"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {searching ? (
        <ul id={listboxId} role="listbox" aria-label="Clients trouvés" className="mt-2 space-y-1">
          {results.map((client, index) => (
            <li key={client.id} role="option" aria-selected={index === highlighted}>
              <button
                type="button"
                onClick={() => { onSelect(client); setQuery(""); }}
                onMouseEnter={() => setHighlighted(index)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${index === highlighted ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
              >
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-animeo-soft text-xs font-black text-animeo-dark">
                  {initialsFor(client.firstName, client.lastName)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-animeo-dark">{client.firstName} {client.lastName}</span>
                  <span className="block truncate text-xs text-animeo-muted">
                    {[client.phone, client.email].filter(Boolean).join(" · ") || "Aucune coordonnée enregistrée"}
                  </span>
                </span>
                <span className="shrink-0 text-xs font-bold text-animeo-muted">
                  {client.animals.length > 0 ? `${client.animals.length} ${client.animals.length > 1 ? "animaux" : "animal"}` : "Aucun animal"}
                </span>
              </button>
            </li>
          ))}

          {results.length === 0 ? (
            <li className="rounded-xl bg-animeo-bg px-3 py-4 text-center">
              <p className="text-sm font-bold text-animeo-dark">Aucun client trouvé</p>
              <p className="mt-0.5 text-xs text-animeo-muted">« {debounced.trim()} » ne correspond à aucune fiche.</p>
              <button
                type="button"
                onClick={() => onCreate(debounced.trim())}
                className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-xl bg-animeo px-4 text-sm font-extrabold text-white transition hover:bg-animeo-hover"
              >
                <UserPlus aria-hidden="true" className="h-4 w-4" />
                Créer « {debounced.trim()} »
              </button>

              {/* Un rendez-vous peut exister sans fiche client — un passage
                  unique, un appel où l'on ne veut pas créer de fiche tout de
                  suite. Le nom seul est alors enregistré. */}
              <button
                type="button"
                onClick={() => onUseWithoutFile(debounced.trim())}
                className="mt-2 block w-full rounded-xl px-3 py-2 text-xs font-extrabold text-animeo-muted transition hover:bg-white hover:text-animeo-dark"
              >
                Utiliser ce nom sans créer de fiche
              </button>
            </li>
          ) : null}
        </ul>
      ) : null}
    </div>
  );
}
