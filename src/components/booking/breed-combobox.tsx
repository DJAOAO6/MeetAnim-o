"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { bookingInputClassName } from "@/components/booking/booking-ui";
import { isKnownBreed, searchBreeds } from "@/data/breeds";
import type { PublicAnimalType } from "@/data/public-booking";

type BreedComboboxProps = {
  species: PublicAnimalType;
  value: string;
  onChange: (value: string) => void;
  onCommit?: () => void;
  placeholder?: string;
  inputRef?: (node: HTMLInputElement | null) => void;
};

export function BreedCombobox({ species, value, onChange, onCommit, placeholder, inputRef }: BreedComboboxProps) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const reactId = useId();
  const listboxId = `${reactId}-listbox`;
  const matches = searchBreeds(species, value);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  function select(breed: string) {
    onChange(breed);
    setOpen(false);
    setActiveIndex(-1);
    onCommit?.();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Escape") { setOpen(false); return; }
    if (!open || matches.length === 0) {
      if (event.key === "Enter") onCommit?.();
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, matches.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      if (activeIndex >= 0) select(matches[activeIndex]);
      else { setOpen(false); onCommit?.(); }
    }
  }

  const showUnrecognizedHint = value.trim().length > 0 && !isKnownBreed(species, value);

  return (
    <div ref={containerRef} className="relative">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        aria-activedescendant={activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined}
        aria-autocomplete="list"
        autoComplete="off"
        value={value}
        onChange={(event) => { onChange(event.target.value); setOpen(true); setActiveIndex(-1); }}
        onFocus={() => setOpen(true)}
        onBlur={() => { setOpen(false); onCommit?.(); }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className={bookingInputClassName}
      />

      {open && matches.length > 0 ? (
        <ul id={listboxId} role="listbox" aria-label="Suggestions" className="absolute z-30 mt-1.5 max-h-56 w-full overflow-y-auto rounded-xl border border-[#d7e4e1] bg-white py-1 shadow-[0_12px_32px_rgba(24,59,69,0.14)]">
          {matches.map((breed, index) => (
            <li
              key={breed}
              id={`${listboxId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(event) => { event.preventDefault(); select(breed); }}
              onMouseEnter={() => setActiveIndex(index)}
              className={`cursor-pointer truncate px-4 py-2.5 text-sm font-semibold leading-snug text-animeo-dark transition ${index === activeIndex ? "bg-animeo-soft" : "hover:bg-animeo-bg"}`}
            >
              {breed}
            </li>
          ))}
        </ul>
      ) : null}

      {showUnrecognizedHint ? <p className="mt-1.5 text-xs text-animeo-muted">Non reconnu(e), sera enregistré(e) tel quel.</p> : null}
    </div>
  );
}
