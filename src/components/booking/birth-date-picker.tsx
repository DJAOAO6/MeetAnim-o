"use client";

import { useEffect, useRef, useState } from "react";
import { bookingInputClassName } from "@/components/booking/booking-ui";
import type { BirthDateValue } from "@/lib/animal-age";

type BirthDatePickerProps = {
  id?: string;
  value: BirthDateValue;
  onChange: (value: BirthDateValue) => void;
  inputRef?: (node: HTMLInputElement | null) => void;
  ariaDescribedBy?: string;
};

type Level = "day" | "month" | "year";

const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];
const weekdayLetters = ["L", "M", "M", "J", "V", "S", "D"];

function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function parseIso(iso: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return null;
  return { year: Number(match[1]), month: Number(match[2]) - 1, day: Number(match[3]) };
}

function formatDisplay(value: BirthDateValue): string {
  if (!value.date) return "";
  const parsed = parseIso(value.date);
  if (!parsed) return "";
  if (value.approximate) return `${parsed.year} (année estimée)`;
  return `${String(parsed.day).padStart(2, "0")}/${String(parsed.month + 1).padStart(2, "0")}/${parsed.year}`;
}

function parseTyped(text: string): string | null {
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(year, month - 1, day, 12);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (iso > todayIso()) return null;
  return iso;
}

function maskTyping(raw: string, previous: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  const previousDigits = previous.replace(/\D/g, "");
  const deleting = digits.length < previousDigits.length;
  let out = digits;
  if (digits.length > 4) out = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  else if (digits.length > 2) out = `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (deleting) return raw.length <= 1 ? "" : raw;
  return out;
}

export function BirthDatePicker({ id, value, onChange, inputRef, ariaDescribedBy }: BirthDatePickerProps) {
  const [open, setOpen] = useState(false);
  const [level, setLevel] = useState<Level>("day");
  const [yearOnlyMode, setYearOnlyMode] = useState(false);
  const [typed, setTyped] = useState(() => formatDisplay(value));
  const now = new Date();
  const parsedValue = value.date ? parseIso(value.date) : null;
  const [viewYear, setViewYear] = useState(parsedValue?.year ?? now.getFullYear() - 3);
  const [viewMonth, setViewMonth] = useState(parsedValue?.month ?? now.getMonth());
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function openPicker() {
    setYearOnlyMode(false);
    setLevel("day");
    if (parsedValue) { setViewYear(parsedValue.year); setViewMonth(parsedValue.month); }
    setOpen(true);
  }

  function commit(iso: string, approximate: boolean) {
    onChange({ date: iso, approximate });
    setTyped(formatDisplay({ date: iso, approximate }));
    setOpen(false);
  }

  function pickDay(day: number) {
    const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    if (iso > todayIso()) return;
    commit(iso, false);
  }

  function pickMonth(month: number) {
    setViewMonth(month);
    setLevel("day");
  }

  function pickYear(year: number) {
    if (year > now.getFullYear()) return;
    setViewYear(year);
    if (yearOnlyMode) { commit(`${year}-07-01`, true); return; }
    setLevel("month");
  }

  function handleTypedChange(next: string) {
    setTyped((current) => maskTyping(next, current));
  }

  function commitTyped() {
    const iso = parseTyped(typed);
    if (iso) onChange({ date: iso, approximate: false });
    else setTyped(formatDisplay(value));
  }

  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const firstWeekday = (new Date(viewYear, viewMonth, 1).getDay() + 6) % 7;
  const decadeStart = Math.floor(viewYear / 12) * 12 - 4;
  const nextDisabled = level === "day" ? viewYear === now.getFullYear() && viewMonth === now.getMonth() : viewYear >= now.getFullYear();

  function goPrevious() {
    if (level === "day") {
      if (viewMonth === 0) { setViewMonth(11); setViewYear((year) => year - 1); }
      else setViewMonth((month) => month - 1);
    } else if (level === "month") {
      setViewYear((year) => year - 1);
    } else {
      setViewYear((year) => year - 12);
    }
  }

  function goNext() {
    if (level === "day") {
      if (viewMonth === 11) { setViewMonth(0); setViewYear((year) => year + 1); }
      else setViewMonth((month) => month + 1);
    } else if (level === "month") {
      setViewYear((year) => year + 1);
    } else {
      setViewYear((year) => year + 12);
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative"
      onBlur={(event) => {
        // Un Tab (ou tout déplacement du focus) hors du composant doit
        // refermer le calendrier : le clic extérieur (mousedown) ne couvre
        // que la souris, pas la navigation clavier.
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
      }}
    >
      <div className="relative">
        <input
          id={id}
          ref={inputRef}
          value={typed}
          onChange={(event) => handleTypedChange(event.target.value)}
          onBlur={commitTyped}
          onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitTyped(); setOpen(false); } }}
          className={`${bookingInputClassName} pr-11`}
          placeholder="JJ/MM/AAAA"
          inputMode="numeric"
          autoComplete="off"
          aria-describedby={ariaDescribedBy}
        />
        <button
          type="button"
          onClick={() => (open ? setOpen(false) : openPicker())}
          aria-label="Ouvrir le calendrier"
          className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-lg text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-dark"
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M16 3v4M8 3v4M3 10h18" />
          </svg>
        </button>
      </div>

      {open ? (
        <div role="dialog" aria-label="Choisir une date de naissance" className="absolute left-0 top-[calc(100%+6px)] z-20 w-72 rounded-2xl border border-[#d9e5e2] bg-white p-3 shadow-[0_16px_35px_rgba(21,63,71,0.16)]">
          <div className="mb-2 flex items-center justify-between">
            <button type="button" onClick={goPrevious} aria-label="Précédent" className="flex h-8 w-8 items-center justify-center rounded-lg text-animeo-dark hover:bg-animeo-bg">‹</button>
            <button type="button" onClick={() => setLevel(level === "day" ? "month" : "year")} className="rounded-lg px-2 py-1 text-sm font-extrabold text-animeo-dark hover:bg-animeo-bg">
              {level === "day" ? `${monthNames[viewMonth]} ${viewYear}` : level === "month" ? String(viewYear) : `${decadeStart} – ${decadeStart + 11}`}
            </button>
            <button type="button" onClick={goNext} disabled={nextDisabled} aria-label="Suivant" className="flex h-8 w-8 items-center justify-center rounded-lg text-animeo-dark hover:bg-animeo-bg disabled:cursor-not-allowed disabled:opacity-30">›</button>
          </div>

          {level === "year" ? (
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: 12 }, (_, index) => decadeStart + index).map((year) => (
                <button key={year} type="button" onClick={() => pickYear(year)} disabled={year > now.getFullYear()} className={`rounded-lg py-2 text-sm font-bold transition ${year === viewYear ? "bg-animeo text-white" : "text-animeo-dark hover:bg-animeo-bg"} disabled:cursor-not-allowed disabled:opacity-30`}>
                  {year}
                </button>
              ))}
            </div>
          ) : level === "month" ? (
            <div className="grid grid-cols-3 gap-1.5">
              {monthNames.map((name, index) => {
                const disabled = viewYear === now.getFullYear() && index > now.getMonth();
                return (
                  <button key={name} type="button" onClick={() => pickMonth(index)} disabled={disabled} className={`rounded-lg py-2 text-xs font-bold transition ${index === viewMonth ? "bg-animeo text-white" : "text-animeo-dark hover:bg-animeo-bg"} disabled:cursor-not-allowed disabled:opacity-30`}>
                    {name.slice(0, 3)}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="grid grid-cols-7 gap-1 text-center">
              {weekdayLetters.map((letter, index) => <span key={index} className="text-[10px] font-black text-animeo-muted">{letter}</span>)}
              {Array.from({ length: firstWeekday }, (_, index) => <span key={`empty-${index}`} />)}
              {Array.from({ length: daysInMonth }, (_, index) => index + 1).map((day) => {
                const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                const disabled = iso > todayIso();
                const selected = value.date === iso && !value.approximate;
                return (
                  <button key={day} type="button" onClick={() => pickDay(day)} disabled={disabled} className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold transition ${selected ? "bg-animeo text-white" : "text-animeo-dark hover:bg-animeo-bg"} disabled:cursor-not-allowed disabled:text-[#c7d1d0]`}>
                    {day}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            onClick={() => { setYearOnlyMode(true); setLevel("year"); }}
            className="mt-3 w-full rounded-lg border-t border-[#eef1f1] pt-2.5 text-center text-xs font-extrabold text-animeo hover:text-[#459e90]"
          >
            Je ne connais pas la date exacte → indiquer juste l’année
          </button>
        </div>
      ) : null}
    </div>
  );
}
