"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { addMonths, formatBookingDateLabels, getMonthGridDays, parseDateIdToLocalNoon, toLocalDateId } from "@/lib/booking-validation";

export type CalendarDayStatus = "available" | "full" | "closed" | "outside-window";

type CalendarMonthProps = {
  monthId: string;
  onMonthChange: (monthId: string) => void;
  minMonthId: string;
  maxMonthId: string;
  selectedDateId: string | null;
  onSelectDate: (dateId: string) => void;
  statusFor: (dateId: string) => CalendarDayStatus;
};

const weekdayHeaders = ["LUN", "MAR", "MER", "JEU", "VEN", "SAM", "DIM"];

function capitalizeFrench(value: string): string {
  return value.charAt(0).toLocaleUpperCase("fr-FR") + value.slice(1);
}

function monthLabelFor(monthId: string): string {
  return capitalizeFrench(new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" }).format(parseDateIdToLocalNoon(`${monthId}-01`)));
}

/** Découpe la liste des jours (avec ses cellules vides de tête) en semaines de 7, pour le rendu ligne par ligne (role="row"). */
function chunkIntoWeeks(leadingBlanks: number, dateIds: string[]): (string | null)[][] {
  const cells: (string | null)[] = [...Array.from({ length: leadingBlanks }, () => null), ...dateIds];
  const weeks: (string | null)[][] = [];
  for (let index = 0; index < cells.length; index += 7) {
    const week = cells.slice(index, index + 7);
    while (week.length < 7) week.push(null);
    weeks.push(week);
  }
  return weeks;
}

/**
 * Calendrier mensuel accessible (pattern grille ARIA APG) : role="grid",
 * roving tabindex, navigation flèches/Home/End/PageUp/PageDown — voir
 * PROMPT-CALENDRIER.md §A2/§A4. Les cellules non sélectionnables
 * (aria-disabled) restent focusables au clavier pour rester explorables
 * (jamais `disabled`, qui les retirerait entièrement de la navigation).
 */
export function CalendarMonth({ monthId, onMonthChange, minMonthId, maxMonthId, selectedDateId, onSelectDate, statusFor }: CalendarMonthProps) {
  const { leadingBlanks, dateIds } = getMonthGridDays(monthId);
  const [focusedDateId, setFocusedDateId] = useState(() => selectedDateId ?? dateIds[0]);
  const [announcement, setAnnouncement] = useState("");
  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const shouldFocusAfterNav = useRef(false);

  // Un changement de mois déclenché depuis l'extérieur (boutons précédent/
  // suivant, ou un saut clavier qui a déjà fixé focusedDateId lui-même) doit
  // garder focusedDateId cohérent avec le mois affiché, sans forcer le focus
  // DOM à chaque fois (seule la navigation clavier explicite le fait, via
  // shouldFocusAfterNav — un clic souris sur les boutons de mois ne doit pas
  // voler le focus au bouton qui vient d'être cliqué).
  useEffect(() => {
    if (!focusedDateId.startsWith(monthId)) {
      const day = Number(focusedDateId.slice(-2));
      const { dateIds: monthDays } = getMonthGridDays(monthId);
      const nextFocused = monthDays[Math.min(day, monthDays.length) - 1] ?? monthDays[0];
      // queueMicrotask : évite d'appeler setState de façon synchrone au corps
      // de l'effet (même convention que schedule-step.tsx et
      // src/components/availability/manual-availability.ts).
      queueMicrotask(() => setFocusedDateId(nextFocused));
    }
  }, [monthId, focusedDateId]);

  useEffect(() => {
    if (shouldFocusAfterNav.current) {
      shouldFocusAfterNav.current = false;
      cellRefs.current.get(focusedDateId)?.focus();
    }
  }, [focusedDateId]);

  function canGoTo(delta: number): boolean {
    const target = addMonths(monthId, delta);
    return target >= minMonthId && target <= maxMonthId;
  }

  function goToMonth(delta: number, focusDay?: number) {
    const target = addMonths(monthId, delta);
    if (target < minMonthId || target > maxMonthId) return;
    if (focusDay !== undefined) {
      const { dateIds: targetDays } = getMonthGridDays(target);
      setFocusedDateId(targetDays[Math.min(focusDay, targetDays.length) - 1]);
      shouldFocusAfterNav.current = true;
    }
    onMonthChange(target);
    setAnnouncement(`${monthLabelFor(target)} affiché`);
  }

  function moveFocus(deltaDays: number) {
    const current = parseDateIdToLocalNoon(focusedDateId);
    current.setDate(current.getDate() + deltaDays);
    const nextId = toLocalDateId(current);
    const nextMonthId = nextId.slice(0, 7);
    if (nextMonthId < minMonthId || nextMonthId > maxMonthId) return;
    setFocusedDateId(nextId);
    shouldFocusAfterNav.current = true;
    if (nextMonthId !== monthId) onMonthChange(nextMonthId);
  }

  function selectDate(dateId: string) {
    onSelectDate(dateId);
    setFocusedDateId(dateId);
    setAnnouncement(`${formatBookingDateLabels(dateId).fullLabel} sélectionné`);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>, dateId: string) {
    switch (event.key) {
      case "ArrowLeft":
        event.preventDefault();
        moveFocus(-1);
        break;
      case "ArrowRight":
        event.preventDefault();
        moveFocus(1);
        break;
      case "ArrowUp":
        event.preventDefault();
        moveFocus(-7);
        break;
      case "ArrowDown":
        event.preventDefault();
        moveFocus(7);
        break;
      case "Home": {
        event.preventDefault();
        const weekday = (parseDateIdToLocalNoon(dateId).getDay() + 6) % 7;
        moveFocus(-weekday);
        break;
      }
      case "End": {
        event.preventDefault();
        const weekday = (parseDateIdToLocalNoon(dateId).getDay() + 6) % 7;
        moveFocus(6 - weekday);
        break;
      }
      case "PageUp":
        event.preventDefault();
        goToMonth(-1, Number(dateId.slice(-2)));
        break;
      case "PageDown":
        event.preventDefault();
        goToMonth(1, Number(dateId.slice(-2)));
        break;
      case "Enter":
      case " ":
        event.preventDefault();
        if (statusFor(dateId) === "available") selectDate(dateId);
        break;
    }
  }

  const monthLabel = monthLabelFor(monthId);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2">
        <button type="button" onClick={() => goToMonth(-1)} disabled={!canGoTo(-1)} aria-label="Mois précédent" className="touch-manipulation flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#dfe9e6] text-animeo-dark outline-none transition hover:bg-animeo-bg focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronIcon direction="left" />
        </button>
        <p className="text-sm font-black capitalize text-animeo-dark">{monthLabel}</p>
        <button type="button" onClick={() => goToMonth(1)} disabled={!canGoTo(1)} aria-label="Mois suivant" className="touch-manipulation flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#dfe9e6] text-animeo-dark outline-none transition hover:bg-animeo-bg focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">
          <ChevronIcon direction="right" />
        </button>
      </div>

      <div role="grid" aria-label={`Calendrier, ${monthLabel}`}>
        {/* aria-hidden : chaque cellule porte déjà son nom accessible complet
            ("Jeudi 5 novembre 2026"), ces abréviations visuelles seraient une
            annonce redondante pour un lecteur d'écran. */}
        <div aria-hidden="true" className="mb-1 grid grid-cols-7 gap-0.5 sm:gap-1">
          {weekdayHeaders.map((label) => (
            <span key={label} className="block text-center text-[10px] font-black uppercase text-animeo-muted sm:text-xs">
              {label}
            </span>
          ))}
        </div>
        {chunkIntoWeeks(leadingBlanks, dateIds).map((week, weekIndex) => (
          <div role="row" key={weekIndex} className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {week.map((dateId, dayIndex) => {
              if (!dateId) return <div key={dayIndex} role="presentation" />;
              const status = statusFor(dateId);
              const isSelected = dateId === selectedDateId;
              const isSelectable = status === "available";
              const { fullLabel, shortLabel } = formatBookingDateLabels(dateId);
              const dayNumber = Number(dateId.slice(-2));
              const monthAbbrev = shortLabel.split(" ")[1] ?? "";
              const accessibleName = status === "full" ? `${fullLabel}, complet` : fullLabel;

              return (
                <button
                  key={dateId}
                  ref={(node) => {
                    if (node) cellRefs.current.set(dateId, node);
                    else cellRefs.current.delete(dateId);
                  }}
                  type="button"
                  role="gridcell"
                  tabIndex={dateId === focusedDateId ? 0 : -1}
                  aria-selected={isSelected}
                  aria-disabled={!isSelectable}
                  aria-label={accessibleName}
                  onFocus={() => setFocusedDateId(dateId)}
                  onKeyDown={(event) => handleKeyDown(event, dateId)}
                  onClick={() => { if (isSelectable) selectDate(dateId); }}
                  className={`touch-manipulation flex min-h-11 flex-col items-center justify-center rounded-lg border px-1 py-1.5 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2 sm:min-h-14 ${
                    isSelected
                      ? "border-animeo-dark bg-animeo-dark text-white"
                      : isSelectable
                        ? "cursor-pointer border-[#dfe9e6] bg-white hover:border-[#aad5cd]"
                        : "cursor-not-allowed border-transparent bg-transparent text-animeo-muted opacity-40"
                  }`}
                >
                  <span aria-hidden="true" className={`text-sm font-black sm:text-base ${isSelected ? "text-white" : isSelectable ? "text-animeo-dark" : ""}`}>{dayNumber}</span>
                  <span aria-hidden="true" className={`text-[9px] font-bold uppercase sm:text-[10px] ${isSelected ? "text-white/75" : "text-animeo-muted"}`}>
                    {status === "full" ? "Complet" : monthAbbrev}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </div>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d={direction === "left" ? "m15 6-6 6 6 6" : "m9 6 6 6-6 6"} />
    </svg>
  );
}
