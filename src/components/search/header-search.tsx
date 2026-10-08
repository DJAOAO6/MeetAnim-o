"use client";

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useClientDirectory } from "@/components/search/client-directory-context";
import { MIN_QUERY_LENGTH, normalizeForSearch, searchPeople } from "@/lib/fuzzy-match";
import type { ClientPickerOption } from "@/data/clients";

/**
 * Recherche de l'en-tête (chantier C5) : des suggestions pendant la frappe,
 * classées sur place parmi les clients déjà chargés (aucune requête), et
 * tolérantes aux accents et aux fautes. Motif ARIA combobox : le focus reste
 * dans le champ, les flèches parcourent la liste.
 *
 * Un client ouvre sa fiche ; un animal, la fiche de son propriétaire sur
 * cet animal. Entrée sans choix : la liste des clients filtrée (`?q=`).
 */

const LIMIT = 5;

type Option =
  | { kind: "client"; key: string; href: string; client: ClientPickerOption }
  | { kind: "animal"; key: string; href: string; client: ClientPickerOption; animal: ClientPickerOption["animals"][number] };

function clientOption(client: ClientPickerOption): Option {
  return { kind: "client", key: `client-${client.id}`, href: `/dashboard/clients/${client.id}`, client };
}

function animalOption(client: ClientPickerOption, animal: ClientPickerOption["animals"][number]): Option {
  return { kind: "animal", key: `animal-${animal.id}`, href: `/dashboard/clients/${client.id}?animal=${animal.id}`, client, animal };
}

export function HeaderSearch({ variant = "header", autoFocus = false, onNavigate }: {
  variant?: "header" | "fullscreen";
  autoFocus?: boolean;
  /** Après un choix : la recherche plein écran (mobile) se referme. */
  onNavigate?: () => void;
}) {
  const router = useRouter();
  const directory = useClientDirectory();
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = `${useId()}-suggestions`;

  const searchable = normalizeForSearch(value).replace(/\s/g, "").length >= MIN_QUERY_LENGTH;
  const results = useMemo(() => (searchable ? searchPeople(value, directory, { limit: LIMIT }) : null), [searchable, value, directory]);

  const groups = useMemo(() => {
    if (!results) return { clients: [], animals: [], approximate: [] } as Record<"clients" | "animals" | "approximate", Option[]>;
    return {
      clients: results.clients.map((entry) => clientOption(entry.client)),
      animals: results.animals.map((entry) => animalOption(entry.client, entry.animal)),
      approximate: [
        ...results.approximate.clients.map((entry) => ({ option: clientOption(entry.client), score: entry.score })),
        ...results.approximate.animals.map((entry) => ({ option: animalOption(entry.client, entry.animal), score: entry.score })),
      ].sort((a, b) => b.score - a.score).slice(0, LIMIT).map((entry) => entry.option),
    };
  }, [results]);
  const options = [...groups.clients, ...groups.animals, ...groups.approximate];
  const expanded = open && searchable;

  // Ctrl+K / Cmd+K : la recherche, d'où que l'on soit. Seulement le champ
  // visible (celui de l'en-tête est masqué sur mobile).
  useEffect(() => {
    if (variant !== "header") return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const input = inputRef.current;
      if (!input || input.offsetParent === null) return;
      event.preventDefault();
      input.focus();
      input.select();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [variant]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  function go(href: string) {
    setOpen(false);
    setActiveIndex(-1);
    setValue("");
    onNavigate?.();
    router.push(href);
  }

  function submitFreeText() {
    const trimmed = value.trim();
    go(trimmed ? `/dashboard/clients?q=${encodeURIComponent(trimmed)}` : "/dashboard/clients");
  }

  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index + 1) % options.length);
    } else if (event.key === "ArrowUp") {
      if (options.length === 0) return;
      event.preventDefault();
      setOpen(true);
      setActiveIndex((index) => (index <= 0 ? options.length - 1 : index - 1));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (expanded && activeIndex >= 0 && options[activeIndex]) go(options[activeIndex].href);
      else submitFreeText();
    } else if (event.key === "Escape") {
      if (expanded) {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        setActiveIndex(-1);
      }
    }
  }

  const fullscreen = variant === "fullscreen";
  // Position de chaque suggestion dans la liste entière (flèches, aria-activedescendant).
  const renderGroup = (label: string, list: Option[], offset: number) => {
    if (list.length === 0) return null;
    const labelId = `${listboxId}-group-${offset}`;
    return (
      <div role="group" aria-labelledby={labelId}>
        <p id={labelId} role="presentation" className="px-4 pb-1 pt-2.5 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">{label}</p>
        {list.map((option, rank) => {
          const position = offset + rank;
          return (
            <SuggestionRow
              key={`${label}-${option.key}`}
              id={`${listboxId}-option-${position}`}
              option={option}
              active={position === activeIndex}
              onHover={() => setActiveIndex(position)}
              onChoose={() => go(option.href)}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      role="search"
      className={fullscreen ? "flex min-h-0 flex-1 flex-col" : "relative"}
      onBlur={(event) => {
        if (!containerRef.current?.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <Search aria-hidden="true" className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-animeo-muted" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Rechercher un client, un animal"
          aria-expanded={expanded}
          aria-controls={listboxId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
          aria-keyshortcuts={fullscreen ? undefined : "Control+K Meta+K"}
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setOpen(true);
            setActiveIndex(-1);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Rechercher un client, un animal…"
          className={fullscreen
            ? "h-12 w-full rounded-2xl border border-animeo-border bg-white pl-11 pr-4 text-base font-semibold text-animeo-dark outline-none placeholder:text-animeo-subtle focus:border-animeo"
            : "h-12 w-64 rounded-2xl border border-animeo-border bg-white pl-11 pr-14 text-sm font-semibold text-animeo-dark shadow-[0_4px_16px_rgb(var(--theme-shadow-rgb)/0.04)] outline-none transition-[width,border-color] placeholder:text-animeo-subtle focus:w-80 focus:border-animeo lg:w-72"}
        />
        {fullscreen ? null : (
          <kbd aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded-md border border-animeo-border bg-animeo-bg px-1.5 py-0.5 text-[10px] font-extrabold text-animeo-muted">Ctrl K</kbd>
        )}
      </div>

      {/* Le nombre de suggestions, annoncé sans déplacer le focus. */}
      <p role="status" className="sr-only">
        {expanded ? (options.length > 0 ? `${options.length} suggestion${options.length > 1 ? "s" : ""}` : "Aucun client ni animal ne correspond") : ""}
      </p>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Suggestions"
        hidden={!expanded || options.length === 0}
        className={fullscreen
          ? "mt-3 min-h-0 overflow-y-auto rounded-2xl border border-animeo-border bg-white py-1.5"
          : "absolute right-0 z-50 mt-2 max-h-[70vh] w-[min(26rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border border-animeo-border bg-white py-1.5 shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]"}
      >
        {renderGroup("Clients", groups.clients, 0)}
        {renderGroup("Animaux", groups.animals, groups.clients.length)}
        {renderGroup("Vous cherchiez peut-être", groups.approximate, groups.clients.length + groups.animals.length)}
      </div>
      {expanded && options.length === 0 ? (
        <p aria-hidden="true" className={fullscreen ? "mt-4 px-1 text-sm text-animeo-muted" : "absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-animeo-border bg-white px-4 py-3 text-sm text-animeo-muted shadow-[0_14px_35px_rgb(var(--theme-shadow-rgb)/0.15)]"}>
          Aucun client ni animal ne correspond. Entrée : chercher dans la liste des clients.
        </p>
      ) : null}
    </div>
  );
}

function SuggestionRow({ id, option, active, onHover, onChoose }: { id: string; option: Option; active: boolean; onHover: () => void; onChoose: () => void }) {
  const owner = `${option.client.firstName} ${option.client.lastName}`.trim();
  const title: ReactNode = option.kind === "client" ? owner : option.animal.name;
  const detail = option.kind === "client"
    ? [option.client.city, option.client.animals.map((animal) => animal.name).join(", ")].filter(Boolean).join(" · ")
    : [option.animal.species.toLocaleLowerCase("fr-FR"), owner].filter(Boolean).join(" · ");
  return (
    <div
      id={id}
      role="option"
      aria-selected={active}
      tabIndex={-1}
      // mousedown : choisir sans que le champ perde d'abord le focus (ce qui
      // refermerait la liste avant le clic).
      onMouseDown={(event) => event.preventDefault()}
      onClick={onChoose}
      onMouseEnter={onHover}
      className={`mx-1.5 flex min-h-11 cursor-pointer flex-col justify-center rounded-xl px-3 py-2 ${active ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
    >
      <span className="text-sm font-extrabold text-animeo-dark">{title}</span>
      {detail ? <span className="truncate text-xs text-animeo-muted">{detail}</span> : null}
    </div>
  );
}

/**
 * Sur mobile, une loupe dans le bandeau ouvre la même recherche en plein
 * écran. Échap ou « Fermer » la referment et rendent le focus à la loupe.
 */
export function MobileSearchButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    }
    window.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button ref={buttonRef} type="button" onClick={() => setOpen(true)} aria-label="Rechercher un client, un animal" aria-haspopup="dialog" className={className}>
        <Search aria-hidden="true" className="h-5 w-5" />
      </button>
      {open
        ? createPortal(
          <div role="dialog" aria-modal="true" aria-label="Rechercher un client, un animal" className="fixed inset-0 z-[90] flex flex-col bg-animeo-bg p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-base font-black text-animeo-dark">Rechercher</p>
              <Button type="button" variant="secondary" onClick={close} icon={<X aria-hidden="true" className="h-4 w-4" />}>Fermer</Button>
            </div>
            <HeaderSearch variant="fullscreen" autoFocus onNavigate={() => setOpen(false)} />
          </div>,
          document.body,
        )
        : null}
    </>
  );
}
