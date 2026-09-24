"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AgendaEventPopover } from "@/components/agenda/agenda-event-popover";
import { SlotSelectionLayer } from "@/components/agenda/slot-selection-layer";
import { selectionFromClick, toMinutes as slotToMinutes, type SelectionBounds, type SlotSelection } from "@/lib/agenda-selection";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { computeClosedRanges, getDayAvailability, isHourClosed } from "@/lib/availability";
import { checkGeographicWarningAction } from "@/lib/appointments-actions";
import { computeEventColumns } from "@/lib/event-layout";
import { formatGeoWarningMessage } from "@/lib/tour-estimate";
import { notify } from "@/lib/notify";
import type { ClientPickerOption } from "@/data/clients";
import type { AvailabilitySettings } from "@/data/settings";
import { DEFAULT_AGENDA_DISPLAY, ROW_HEIGHT, eventGeometry, pixelsPerMinute, visibleHourRange, type AgendaDisplay } from "@/lib/agenda-display";

type EventKind = "cabinet" | "domicile" | "pending" | "unavailable" | "tournee";

export type CalendarEvent = {
  id: string;
  appointmentId?: string;
  tourId?: string;
  blockedSlotId?: string;
  day: number;
  start: string;
  duration: number;
  kind: EventKind;
  animal?: string;
  client?: string;
  location?: string;
  title?: string;
};

type WeekPlannerProps = {
  dates: Date[];
  clients: ClientPickerOption[];
  availability: AvailabilitySettings;
  onPendingAction: (action: string, event: CalendarEvent) => void;
  onSelectTour: (tourId: string, anchorRect: DOMRect) => void;
  onSelectBlockedSlot: (blockedSlotId: string, anchorRect: DOMRect) => void;
  /**
   * Créneau libre choisi dans la grille : la suite (menu d'actions, création,
   * blocage) est décidée par AgendaView, qui détient déjà les actions et les
   * modales. Le planner ne fait que dire ce qui a été sélectionné.
   */
  onSelectSlot?: (selection: SlotSelection, date: Date, anchorRect: DOMRect, closed: boolean, pointerType: string, bounds: SelectionBounds) => void;
  /** Un clic ailleurs, ou sur une zone non sélectionnable, efface la sélection. */
  onClearSlot?: () => void;
  /** Sélection à mettre en évidence, renvoyée par AgendaView. */
  activeSlot?: SlotSelection | null;
  appointmentEvents?: CalendarEvent[];
  tourEvents?: CalendarEvent[];
  blockedEvents?: CalendarEvent[];
  /** Affichage choisi par le compte : intervalle, densité, heures visibles, zones fermées. */
  display?: AgendaDisplay;
};

const TIME_COLUMN_WIDTH = 56;
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 4;
// Tactile : le glissement n'est jamais armé au premier mouvement du doigt —
// un swipe destiné à faire défiler l'agenda déplaçait sinon le rendez-vous
// touché au départ, et changeait son horaire sans que rien ne le demande.
// Il faut un appui maintenu, immobile, avant que le déplacement devienne
// possible ; le défilement garde la priorité pendant tout ce délai.
const TOUCH_HOLD_MS = 500;
// Tolérance de tremblement pendant l'appui : au-delà, c'est un défilement.
const TOUCH_HOLD_TOLERANCE_PX = 10;

/** Plancher de lisibilité d'une carte, en pixels : en deçà, on ne voit plus rien. */
const MIN_VISIBLE_HEIGHT = 12;
/** Hauteur à partir de laquelle une demande en attente montre ses boutons. */
const PENDING_ACTIONS_MIN_HEIGHT = 72;

/**
 * Lignes de la grille, dessinées en fond plutôt qu'avec un élément par
 * créneau (même à 15 min) : une ligne claire par intervalle, une plus
 * marquée à chaque heure quand l'intervalle est plus court qu'une heure.
 */
function gridLines(rowHeight: number, slotMinutes: number, pxPerMinute: number): React.CSSProperties {
  const row = `linear-gradient(to bottom, transparent ${rowHeight - 1}px, #edf2f0 ${rowHeight - 1}px)`;
  if (slotMinutes >= 60) return { backgroundImage: row, backgroundSize: `100% ${rowHeight}px` };
  const hour = pxPerMinute * 60;
  return {
    backgroundImage: `linear-gradient(to bottom, transparent ${hour - 1}px, #dfe9e6 ${hour - 1}px), ${row}`,
    backgroundSize: `100% ${hour}px, 100% ${rowHeight}px`,
  };
}

/**
 * Ce qui empêche de sélectionner : tout ce qui occupe déjà la colonne —
 * rendez-vous, tournées et créneaux bloqués. Un créneau tracé par-dessus
 * l'un d'eux serait refusé par le serveur ensuite ; autant ne pas le laisser
 * tracer. Partagé par la souris (colonne) et le clavier (grille).
 */
function selectionBoundsFor(startHour: number, endHour: number, step: number, defaultDuration: number, dayEvents: CalendarEvent[]): SelectionBounds {
  return {
    dayStart: startHour * 60,
    dayEnd: endHour * 60,
    step: step > 0 ? step : 15,
    defaultDuration: defaultDuration > 0 ? defaultDuration : 45,
    busy: dayEvents.map((event) => {
      const start = slotToMinutes(event.start);
      return { start, end: start + event.duration };
    }),
  };
}

function closedAtFor(dayAvailability: ReturnType<typeof getDayAvailability>) {
  return (minutes: number) => !dayAvailability.open || isHourClosed(dayAvailability.hourly, Math.floor(minutes / 60));
}

const cursorDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

const eventStyles: Record<EventKind, string> = {
  cabinet: "border-animeo-brand bg-animeo-positive-soft text-animeo-dark",
  domicile: "border-[#4C8190] bg-animeo-info-soft text-[#234E5A]",
  pending: "border-dashed border-animeo-accent bg-animeo-warning-soft/55 text-animeo-warning backdrop-blur-[1px]",
  unavailable: "border-animeo-subtle bg-animeo-surface-alt text-animeo-muted",
  tournee: "border-[#8067B0] bg-[#EEEAF8] text-[#55417F]",
};


const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const dragDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function toMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function minutesToTime(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function dateIdOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isReferenceDay(date: Date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

function useCurrentTime() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);
  return now;
}

type DragState =
  | { kind: "move"; event: CalendarEvent; originDay: number; originStartMinutes: number; grabOffsetMinutes: number; currentDay: number; currentStartMinutes: number }
  | { kind: "resize"; event: CalendarEvent; originDuration: number; currentDuration: number };

export function WeekPlanner({ dates, clients, availability, onPendingAction, onSelectTour, onSelectBlockedSlot, onSelectSlot, onClearSlot, activeSlot = null, appointmentEvents = [], tourEvents = [], blockedEvents = [], display = DEFAULT_AGENDA_DISPLAY }: WeekPlannerProps) {
  const { appointments, saveAppointment } = useAppointments();
  const [selection, setSelection] = useState<{ event: CalendarEvent; anchorRect: DOMRect } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isDayView = dates.length === 1;
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH}px repeat(${dates.length}, minmax(0,1fr))`;
  const allEvents = useMemo(() => [...appointmentEvents, ...tourEvents, ...blockedEvents], [appointmentEvents, tourEvents, blockedEvents]);
  // Géométrie de la grille : la hauteur d'une ligne vient de la densité, sa
  // durée de l'intervalle. Les rendez-vous, eux, gardent leur vraie durée.
  const pxPerMinute = pixelsPerMinute(display);
  const hourHeight = pxPerMinute * 60;
  const { startHour, endHour } = useMemo(
    () => visibleHourRange(display, allEvents.map((event) => ({ start: toMinutes(event.start), end: toMinutes(event.start) + event.duration }))),
    [display, allEvents],
  );
  const plannerHeight = (endHour - startHour) * hourHeight;

  // Clavier : une case active dans la grille, déplacée aux flèches ; Entrée
  // ou Espace ouvre les mêmes actions qu'un clic.
  const [keyboardCursor, setKeyboardCursor] = useState<{ day: number; minutes: number } | null>(null);
  const keyboardHintId = useId();
  const cursorStep = display.slotMinutes;

  function dayContext(day: number) {
    const bounds = selectionBoundsFor(startHour, endHour, cursorStep, availability.defaultAppointmentDuration, allEvents.filter((event) => event.day === day));
    return { bounds, closedAt: closedAtFor(getDayAvailability(dates[day], availability)) };
  }

  function initialKeyboardCursor() {
    const today = dates.findIndex(isReferenceDay);
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const minutes = today >= 0 && nowMinutes >= startHour * 60 && nowMinutes < endHour * 60
      ? Math.floor(nowMinutes / cursorStep) * cursorStep
      : startHour * 60;
    return { day: Math.max(0, today), minutes };
  }

  function describeCursor(cursor: { day: number; minutes: number }): string {
    const date = cursorDateFormatter.format(dates[cursor.day]);
    const time = minutesToTime(cursor.minutes);
    const { bounds, closedAt } = dayContext(cursor.day);
    if (bounds.busy.some((interval) => cursor.minutes >= interval.start && cursor.minutes < interval.end)) return `${date}, ${time} : occupé.`;
    if (closedAt(cursor.minutes)) return `${date}, ${time} : fermé. Entrée pour les actions.`;
    return `Créer un rendez-vous ${date} à ${time}`;
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || !keyboardCursor) return;
    const { day, minutes } = keyboardCursor;
    const last = endHour * 60 - cursorStep;
    let next: { day: number; minutes: number } | null = null;
    if (event.key === "ArrowUp") next = { day, minutes: Math.max(startHour * 60, minutes - cursorStep) };
    else if (event.key === "ArrowDown") next = { day, minutes: Math.min(last, minutes + cursorStep) };
    else if (event.key === "ArrowLeft") next = { day: Math.max(0, day - 1), minutes };
    else if (event.key === "ArrowRight") next = { day: Math.min(dates.length - 1, day + 1), minutes };
    if (next) {
      event.preventDefault();
      setKeyboardCursor(next);
      return;
    }
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    if (!onSelectSlot || !gridRef.current) return;
    const { bounds, closedAt } = dayContext(day);
    const selected = selectionFromClick(day, minutes, bounds);
    if (!selected) return;
    const grid = gridRef.current.getBoundingClientRect();
    const columnWidth = (grid.width - TIME_COLUMN_WIDTH) / dates.length;
    const rect = new DOMRect(
      grid.left + TIME_COLUMN_WIDTH + day * columnWidth,
      grid.top + (selected.startMinutes - startHour * 60) * pxPerMinute,
      columnWidth,
      (selected.endMinutes - selected.startMinutes) * pxPerMinute,
    );
    onSelectSlot(selected, dates[day], rect, closedAt(selected.startMinutes), "keyboard", bounds);
  }

  // La case active reste visible : la page défile jusqu'à elle si besoin.
  useEffect(() => {
    if (!keyboardCursor) return;
    document.querySelector<HTMLElement>("[data-testid='agenda-keyboard-cursor']")?.scrollIntoView({ block: "nearest" });
  }, [keyboardCursor]);
  const now = useCurrentTime();
  const gridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const justDraggedRef = useRef(false);
  // Rendez-vous dont le déplacement tactile est armé : sert au retour visuel
  // « mode déplacement » et n'a aucun effet à la souris.
  const [armedEventId, setArmedEventId] = useState<string | null>(null);
  const releaseTouchScrollRef = useRef<(() => void) | null>(null);

  // Le verrou de défilement tactile vit sur window : un démontage pendant un
  // déplacement armé (changement de semaine, navigation) le laisserait actif
  // et figerait le défilement de la page.
  useEffect(() => () => { releaseTouchScrollRef.current?.(); }, []);

  function handleSelectEvent(event: CalendarEvent, anchorRect: DOMRect) {
    if (justDraggedRef.current) { justDraggedRef.current = false; return; }
    if (event.appointmentId) { setSelection({ event, anchorRect }); return; }
    if (event.tourId) { onSelectTour(event.tourId, anchorRect); return; }
    if (event.blockedSlotId) { onSelectBlockedSlot(event.blockedSlotId, anchorRect); return; }
  }

  function closeSelection() {
    setSelection(null);
  }

  const selectedAppointment = selection?.event.appointmentId
    ? appointments.find((item) => item.id === selection.event.appointmentId)
    : undefined;

  /**
   * Geste tactile sécurisé (doigt, stylet) : le déplacement d'un rendez-vous
   * n'est jamais déclenché par le premier mouvement du doigt. Il faut un
   * appui maintenu et immobile — tout mouvement avant la fin du délai annule
   * l'armement et laisse le navigateur faire défiler l'agenda. Sans cela, un
   * simple défilement vertical replanifiait le rendez-vous touché au départ.
   * La souris garde le glissement immédiat : il n'y a pas d'ambiguïté entre
   * glisser et faire défiler avec un pointeur fin.
   */
  function withTouchArming(event: CalendarEvent, pointerEvent: React.PointerEvent, startDrag: () => void) {
    if (pointerEvent.pointerType === "mouse") { startDrag(); return; }

    const startClientX = pointerEvent.clientX;
    const startClientY = pointerEvent.clientY;
    let settled = false;

    function cleanup() {
      window.clearTimeout(holdTimer);
      window.removeEventListener("pointermove", handleHoldMove);
      window.removeEventListener("pointerup", handleHoldEnd);
      window.removeEventListener("pointercancel", handleHoldEnd);
    }

    function handleHoldMove(moveEvent: PointerEvent) {
      if (Math.abs(moveEvent.clientX - startClientX) <= TOUCH_HOLD_TOLERANCE_PX && Math.abs(moveEvent.clientY - startClientY) <= TOUCH_HOLD_TOLERANCE_PX) return;
      settled = true;
      cleanup();
    }

    function handleHoldEnd() {
      settled = true;
      cleanup();
    }

    const holdTimer = window.setTimeout(() => {
      cleanup();
      if (settled) return;
      setArmedEventId(event.id);
      lockTouchScroll();
      // Un appui long n'a aucun signal visible par lui-même : vibration
      // courte quand l'appareil la propose, en plus du retour visuel porté
      // par armedEventId.
      if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") navigator.vibrate(25);
      // Le doigt sera relevé sur le rendez-vous : sans ça, le relâchement
      // rouvrirait la fiche par-dessus le déplacement qui vient d'avoir lieu.
      justDraggedRef.current = true;
      startDrag();
    }, TOUCH_HOLD_MS);

    window.addEventListener("pointermove", handleHoldMove);
    window.addEventListener("pointerup", handleHoldEnd);
    window.addEventListener("pointercancel", handleHoldEnd);
  }

  /**
   * `touch-action` ne suffit pas une fois le geste commencé : le navigateur a
   * déjà arbitré entre défilement et glissement au premier contact. Un
   * écouteur touchmove non passif qui refuse l'événement est le seul moyen
   * fiable de figer le défilement pendant un déplacement armé.
   */
  function lockTouchScroll() {
    const prevent = (touchEvent: TouchEvent) => { if (touchEvent.cancelable) touchEvent.preventDefault(); };
    window.addEventListener("touchmove", prevent, { passive: false });
    releaseTouchScrollRef.current = () => {
      window.removeEventListener("touchmove", prevent);
      releaseTouchScrollRef.current = null;
    };
  }

  function disarmTouch() {
    releaseTouchScrollRef.current?.();
    setArmedEventId(null);
  }

  function beginMove(event: CalendarEvent, pointerEvent: React.PointerEvent) {
    if (!gridRef.current) return;
    const startClientX = pointerEvent.clientX;
    const startClientY = pointerEvent.clientY;
    const gridTop = gridRef.current.getBoundingClientRect().top;
    const pointerAbsoluteMinutesAtStart = startHour * 60 + ((startClientY - gridTop) / hourHeight) * 60;
    const grabOffsetMinutes = pointerAbsoluteMinutesAtStart - toMinutes(event.start);
    let started = false;

    function handleMove(moveEvent: PointerEvent) {
      if (!gridRef.current) return;
      if (!started) {
        if (Math.abs(moveEvent.clientX - startClientX) < DRAG_THRESHOLD_PX && Math.abs(moveEvent.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        started = true;
        justDraggedRef.current = true;
      }
      const gridRect = gridRef.current.getBoundingClientRect();
      const columnWidth = (gridRect.width - TIME_COLUMN_WIDTH) / dates.length;
      const relativeX = moveEvent.clientX - gridRect.left - TIME_COLUMN_WIDTH;
      const day = Math.min(dates.length - 1, Math.max(0, Math.floor(relativeX / columnWidth)));
      const pointerAbsoluteMinutes = startHour * 60 + ((moveEvent.clientY - gridRect.top) / hourHeight) * 60;
      const rawMinutes = pointerAbsoluteMinutes - grabOffsetMinutes;
      const snapped = Math.round(rawMinutes / SNAP_MINUTES) * SNAP_MINUTES;
      const clamped = Math.min(endHour * 60 - event.duration, Math.max(startHour * 60, snapped));
      const next: DragState = { kind: "move", event, originDay: event.day, originStartMinutes: toMinutes(event.start), grabOffsetMinutes, currentDay: day, currentStartMinutes: clamped };
      dragRef.current = next;
      setDrag(next);
    }

    // pointercancel autant que pointerup : sur mobile, le navigateur reprend
    // parfois la main sur le geste (défilement, menu système) et annule le
    // pointeur sans jamais émettre pointerup — les écouteurs restaient alors
    // attachés et le rendez-vous figé en cours de déplacement.
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      void finishDrag();
    }

    withTouchArming(event, pointerEvent, () => {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    });
  }

  function beginResize(event: CalendarEvent, pointerEvent: React.PointerEvent) {
    const startClientY = pointerEvent.clientY;
    const originDuration = event.duration;
    let started = false;

    function handleMove(moveEvent: PointerEvent) {
      if (!started) {
        if (Math.abs(moveEvent.clientY - startClientY) < DRAG_THRESHOLD_PX) return;
        started = true;
        justDraggedRef.current = true;
      }
      const deltaMinutes = Math.round(((moveEvent.clientY - startClientY) / hourHeight) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
      const startMinutes = toMinutes(event.start);
      const maxDuration = endHour * 60 - startMinutes;
      const nextDuration = Math.min(maxDuration, Math.max(SNAP_MINUTES, originDuration + deltaMinutes));
      const next: DragState = { kind: "resize", event, originDuration, currentDuration: nextDuration };
      dragRef.current = next;
      setDrag(next);
    }

    // pointercancel autant que pointerup : sur mobile, le navigateur reprend
    // parfois la main sur le geste (défilement, menu système) et annule le
    // pointeur sans jamais émettre pointerup — les écouteurs restaient alors
    // attachés et le rendez-vous figé en cours de déplacement.
    function handleUp() {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      void finishDrag();
    }

    withTouchArming(event, pointerEvent, () => {
      window.addEventListener("pointermove", handleMove);
      window.addEventListener("pointerup", handleUp);
      window.addEventListener("pointercancel", handleUp);
    });
  }

  async function finishDrag() {
    const state = dragRef.current;
    dragRef.current = null;
    setDrag(null);
    disarmTouch();
    if (!state) return;

    const original = appointments.find((item) => item.id === state.event.appointmentId);
    if (!original) return;

    if (state.kind === "move") {
      if (state.currentDay === state.originDay && state.currentStartMinutes === state.originStartMinutes) return;
      const targetDate = dates[state.currentDay];
      const targetStart = minutesToTime(state.currentStartMinutes);
      const { open, hourly } = getDayAvailability(targetDate, availability);
      const closed = !open || isHourClosed(hourly, Math.floor(state.currentStartMinutes / 60));
      const conflict = allEvents.some((event) => event.id !== state.event.id && event.day === state.currentDay && event.start === targetStart);
      if (closed || conflict) {
        notify.error("Ce créneau n’est pas disponible : choisissez un autre horaire.");
        return;
      }
      const result = await saveAppointment({ ...original, date: dateIdOf(targetDate), start: targetStart });
      if (!result.ok) { notify.error(result.error ?? "Une erreur est survenue."); return; }
      const label = dragDateFormatter.format(targetDate);
      // Le bloc se déplace visuellement, mais confirmer le jour/heure exact
      // en texte reste utile — un agenda chargé rend le nouvel emplacement
      // moins évident qu'il n'y paraît.
      notify.success(`Rendez-vous de ${original.animalName} déplacé au ${label.charAt(0).toLowerCase()}${label.slice(1)} à ${targetStart}.`);

      // Avertissement d'incompatibilité géographique (refonte tournées,
      // phase 3.3) : purement indicatif, après coup — le glisser-déposer n'a
      // pas de formulaire où l'afficher avant l'enregistrement, contrairement
      // à AppointmentForm.
      if (original.mode === "home" && original.latitude != null && original.longitude != null) {
        const warnings = await checkGeographicWarningAction({
          date: dateIdOf(targetDate),
          start: targetStart,
          duration: original.duration,
          mode: original.mode,
          latitude: original.latitude,
          longitude: original.longitude,
          excludeId: original.id,
        });
        for (const warning of warnings) {
          notify.info(formatGeoWarningMessage(warning.direction, warning.neighborLabel, warning.travelMinutes, warning.gapMinutes));
        }
      }
    } else {
      if (state.currentDuration === state.originDuration) return;
      const result = await saveAppointment({ ...original, duration: state.currentDuration });
      if (!result.ok) { notify.error(result.error ?? "Une erreur est survenue."); return; }
      notify.success(`Durée du rendez-vous de ${original.animalName} mise à jour (${state.currentDuration} min).`);
    }
  }

  const dragValid = useMemo(() => {
    if (!drag || drag.kind !== "move") return true;
    const targetDate = dates[drag.currentDay];
    const targetStart = minutesToTime(drag.currentStartMinutes);
    const { open, hourly } = getDayAvailability(targetDate, availability);
    if (!open || isHourClosed(hourly, Math.floor(drag.currentStartMinutes / 60))) return false;
    return !allEvents.some((event) => event.id !== drag.event.id && event.day === drag.currentDay && event.start === targetStart);
  }, [drag, dates, availability, allEvents]);

  return (
    <>
      {/* overflow-clip et non overflow-hidden : les deux découpent les coins
          arrondis, mais seul le second crée un conteneur de défilement — qui
          empêcherait l'en-tête des jours de rester collé en haut de la page. */}
      <Card className="overflow-clip">
        {/* Pas de min-w forcé : les colonnes de jour (minmax(0,1fr) dans
            gridTemplateColumns) se répartissent sur toute la largeur
            réellement disponible plutôt que de forcer un défilement
            horizontal dès que cette largeur descend sous un seuil arbitraire
            — c'est justement ce qui coupait Samedi/Dimanche sur les largeurs
            de portable courantes. Le dégradé ci-dessous reste en filet de
            sécurité pour le cas extrême (très petit écran) où un
            défilement resterait malgré tout nécessaire. */}
        {/* Plus de défilement interne : c'est la page qui défile, et
            l'en-tête des jours reste collé en haut (sous la barre du
            téléphone). Aucun conteneur de défilement entre lui et la page. */}
        <div
          role="region"
          aria-label={isDayView ? "Planning du jour" : "Planning de la semaine"}
          aria-describedby={keyboardHintId}
          tabIndex={0}
          onFocus={(event) => { if (event.target === event.currentTarget && !keyboardCursor) setKeyboardCursor(initialKeyboardCursor()); }}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardCursor(null); }}
          onKeyDown={handleGridKeyDown}
          className="relative outline-none"
        >
          <p id={keyboardHintId} className="sr-only">Flèches : passer d’un créneau à l’autre. Entrée : actions du créneau.</p>
          <p aria-live="polite" className="sr-only">{keyboardCursor ? describeCursor(keyboardCursor) : ""}</p>
          <div>
            <div
              className="sticky top-16 z-[32] grid border-b border-animeo-border bg-animeo-surface-alt md:top-0"
              style={{ gridTemplateColumns }}
              data-testid="agenda-day-header"
            >
              <div className="border-r border-animeo-border" />
              {dates.map((date) => {
                const active = isReferenceDay(date);

                return (
                  <div key={date.toISOString()} className="border-r border-animeo-border px-2 py-3 text-center last:border-r-0">
                    <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">
                      {dayFormatter.format(date).replace(".", "")}
                    </p>
                    <span className={`mx-auto mt-1 flex h-8 w-8 items-center justify-center rounded-xl text-sm font-black ${active ? "bg-animeo text-white" : "text-animeo-dark"}`}>
                      {date.getDate()}
                    </span>
                  </div>
                );
              })}
            </div>

            <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns }}>
              <TimeColumn
                startHour={startHour}
                endHour={endHour}
                plannerHeight={plannerHeight}
                pxPerMinute={pxPerMinute}
                slotMinutes={display.slotMinutes}
                nowMinutes={dates.some(isReferenceDay) ? now.getHours() * 60 + now.getMinutes() : null}
              />
              {dates.map((date, dayIndex) => (
                <DayColumn
                  key={date.toISOString()}
                  date={date}
                  now={now}
                  availability={availability}
                  startHour={startHour}
                  endHour={endHour}
                  plannerHeight={plannerHeight}
                  pxPerMinute={pxPerMinute}
                  slotMinutes={display.slotMinutes}
                  rowHeight={ROW_HEIGHT[display.density]}
                  showClosedZones={display.showClosedZones}
                  keyboardCursor={keyboardCursor && keyboardCursor.day === dayIndex ? keyboardCursor.minutes : null}
                  events={allEvents.filter((event) => event.day === dayIndex)}
                  draggedEventId={drag?.event.id ?? null}
                  armedEventId={armedEventId}
                  onPendingAction={onPendingAction}
                  onSelectEvent={handleSelectEvent}
                  onBeginMove={beginMove}
                  onBeginResize={beginResize}
                  selectedEventId={selection?.event.id ?? null}
                  slotInterval={display.slotMinutes}
                  defaultDuration={availability.defaultAppointmentDuration}
                  dayIndex={dayIndex}
                  activeSlot={activeSlot && activeSlot.day === dayIndex ? activeSlot : null}
                  onSelectSlot={onSelectSlot ? (slot, rect, closed, pointerType, bounds) => onSelectSlot(slot, date, rect, closed, pointerType, bounds) : undefined}
                  onClearSlot={onClearSlot}
                />
              ))}

              {drag ? (
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute z-40"
                  style={{
                    top: ((drag.kind === "move" ? drag.currentStartMinutes : toMinutes(drag.event.start)) - startHour * 60) * pxPerMinute,
                    height: (drag.kind === "resize" ? drag.currentDuration : drag.event.duration) * pxPerMinute,
                    left: `calc(${TIME_COLUMN_WIDTH}px + ${drag.kind === "move" ? drag.currentDay : drag.event.day} * (100% - ${TIME_COLUMN_WIDTH}px) / ${dates.length})`,
                    width: `calc((100% - ${TIME_COLUMN_WIDTH}px) / ${dates.length})`,
                  }}
                >
                  <div className={`h-full overflow-hidden rounded-xl border-2 border-dashed p-1.5 text-[11px] font-bold leading-tight ${dragValid ? "border-animeo bg-animeo/10 text-animeo-dark" : "border-animeo-error bg-animeo-error/10 text-animeo-danger"}`}>
                    <p>{drag.event.animal ?? drag.event.title}</p>
                    <p className="mt-0.5 font-black">
                      {drag.kind === "move" ? minutesToTime(drag.currentStartMinutes) : drag.event.start}
                      {" · "}
                      {drag.kind === "resize" ? `${drag.currentDuration} min` : `${drag.event.duration} min`}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      {selection && selectedAppointment ? (
        <AgendaEventPopover
          key={selectedAppointment.id}
          appointment={selectedAppointment}
          clients={clients}
          anchorRect={selection.anchorRect}
          onSave={saveAppointment}
          onClose={closeSelection}
        />
      ) : null}
    </>
  );
}

/**
 * Heures de la grille. Intervalle d'une heure ou moins : une étiquette par
 * heure. Au-delà (1 h 30) : une par ligne, pour que chaque ligne se lise.
 */
function timeLabels(startHour: number, endHour: number, slotMinutes: number): number[] {
  const step = slotMinutes > 60 ? slotMinutes : 60;
  const labels: number[] = [];
  for (let minutes = startHour * 60; minutes <= endHour * 60; minutes += step) labels.push(minutes);
  return labels;
}

function TimeColumn({ startHour, endHour, plannerHeight, pxPerMinute, slotMinutes, nowMinutes }: { startHour: number; endHour: number; plannerHeight: number; pxPerMinute: number; slotMinutes: number; nowMinutes: number | null }) {
  const showNow = nowMinutes !== null && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;
  // sticky : sur les petites largeurs, le planning peut défiler
  // horizontalement — l'axe horaire doit rester lisible en permanence
  // plutôt que sortir de l'écran avec les premières colonnes. z-index
  // modeste : au-dessus des colonnes, sous les rendez-vous sélectionnés.
  return (
    <div
      className="sticky left-0 z-20 border-r border-animeo-border bg-animeo-surface-alt"
      style={{ height: plannerHeight }}
      data-testid="agenda-time-column"
    >
      {timeLabels(startHour, endHour, slotMinutes).map((minutes) => (
        <span
          key={minutes}
          className="absolute right-3 -translate-y-1/2 text-[11px] font-bold text-animeo-muted"
          style={{ top: (minutes - startHour * 60) * pxPerMinute }}
        >
          {minutesToTime(minutes)}
        </span>
      ))}
      {/* L'heure actuelle, face à sa ligne : elle masque l'étiquette d'heure
          qu'elle recouvre, pour rester lisible. */}
      {showNow ? (
        <span
          className="absolute right-1.5 z-10 -translate-y-1/2 rounded-md bg-animeo-accent px-1.5 py-0.5 text-[11px] font-black tabular-nums text-animeo-dark shadow-sm"
          style={{ top: (nowMinutes - startHour * 60) * pxPerMinute }}
          data-testid="agenda-now-label"
        >
          {minutesToTime(nowMinutes)}
        </span>
      ) : null}
    </div>
  );
}

function DayColumn({ date, now, availability, startHour, endHour, plannerHeight, pxPerMinute, slotMinutes, rowHeight, showClosedZones, keyboardCursor, events: dayEvents, draggedEventId, armedEventId, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, selectedEventId, dayIndex, slotInterval, defaultDuration, activeSlot, onSelectSlot, onClearSlot }: {
  date: Date;
  now: Date;
  availability: AvailabilitySettings;
  startHour: number;
  endHour: number;
  plannerHeight: number;
  pxPerMinute: number;
  slotMinutes: number;
  rowHeight: number;
  showClosedZones: boolean;
  /** Case active au clavier dans cette colonne (minutes), sinon null. */
  keyboardCursor: number | null;
  events: CalendarEvent[];
  draggedEventId: string | null;
  onPendingAction: WeekPlannerProps["onPendingAction"];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  armedEventId: string | null;
  onBeginMove: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onBeginResize: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  selectedEventId: string | null;
  dayIndex: number;
  /** Intervalle de la grille choisi dans « Affichage » : une case = une ligne. */
  slotInterval: number;
  defaultDuration: number;
  activeSlot: SlotSelection | null;
  onSelectSlot?: (selection: SlotSelection, anchorRect: DOMRect, closed: boolean, pointerType: string, bounds: SelectionBounds) => void;
  onClearSlot?: () => void;
}) {
  const dayAvailability = useMemo(() => getDayAvailability(date, availability), [date, availability]);
  const closedRanges = useMemo(
    () => (dayAvailability.open ? computeClosedRanges(dayAvailability.hourly, startHour, endHour) : [{ start: startHour, end: endHour }]),
    [dayAvailability, startHour, endHour],
  );
  const layout = useMemo(() => computeEventColumns(dayEvents), [dayEvents]);

  /**
   * Ce qui empêche de sélectionner : tout ce qui occupe déjà la colonne —
   * rendez-vous, tournées et créneaux bloqués. Un créneau tracé par-dessus
   * l'un d'eux serait refusé par le serveur ensuite ; autant ne pas le
   * laisser tracer.
   */
  const selectionBounds = useMemo(
    () => selectionBoundsFor(startHour, endHour, slotInterval, defaultDuration, dayEvents),
    [startHour, endHour, slotInterval, defaultDuration, dayEvents],
  );
  const closedAt = useMemo(() => closedAtFor(dayAvailability), [dayAvailability]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showTimeLine = isReferenceDay(date) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <div
      className="relative border-r border-animeo-border last:border-r-0"
      style={{ height: plannerHeight, ...gridLines(rowHeight, slotMinutes, pxPerMinute) }}
    >
      {showTimeLine ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
          style={{ top: (nowMinutes - startHour * 60) * pxPerMinute }}
        >
          <span className="-ml-[4px] h-2 w-2 shrink-0 rounded-full bg-animeo-accent ring-2 ring-white" />
          <div className="h-[2px] flex-1 bg-animeo-accent" />
        </div>
      ) : null}

      {closedRanges.map((range) => (
        <div
          key={`${range.start}-${range.end}`}
          aria-hidden="true"
          // Zones fermées masquées dans l'affichage : un simple voile, sans
          // hachures. Les horaires, eux, ne changent pas.
          className={`pointer-events-none absolute inset-x-0 z-[1] ${showClosedZones ? "bg-[repeating-linear-gradient(135deg,#F1F3F3,#F1F3F3_8px,#E7EBEA_8px,#E7EBEA_16px)]" : "bg-animeo-surface-alt/45"}`}
          data-closed-zone={showClosedZones ? "hatched" : "muted"}
          style={{ top: (range.start - startHour) * 60 * pxPerMinute, height: (range.end - range.start) * 60 * pxPerMinute }}
        >
          {showClosedZones && !dayAvailability.open && range.start === startHour && range.end === endHour ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-animeo-muted">
              Fermé
            </span>
          ) : null}
        </div>
      ))}

      {keyboardCursor !== null ? (
        <div
          aria-hidden="true"
          data-testid="agenda-keyboard-cursor"
          className="pointer-events-none absolute inset-x-1 z-[31] rounded-lg ring-2 ring-animeo ring-offset-1"
          style={{ top: (keyboardCursor - startHour * 60) * pxPerMinute, height: slotMinutes * pxPerMinute }}
        />
      ) : null}

      {onSelectSlot ? (
        <SlotSelectionLayer
          dayIndex={dayIndex}
          bounds={selectionBounds}
          hourHeight={pxPerMinute * 60}
          selection={activeSlot}
          closedAt={closedAt}
          onSelect={(slot, rect, closed, pointerType) => onSelectSlot(slot, rect, closed, pointerType, selectionBounds)}
          onClear={() => onClearSlot?.()}
        />
      ) : null}

      {dayEvents.map((event) => (
        <CalendarEventCard
          key={event.id}
          event={event}
          startHour={startHour}
          pxPerMinute={pxPerMinute}
          columnLayout={layout.get(event.id) ?? { column: 0, columns: 1 }}
          isDragging={event.id === draggedEventId}
          onPendingAction={onPendingAction}
          onSelectEvent={onSelectEvent}
          isArmed={armedEventId === event.id}
          onBeginMove={onBeginMove}
          onBeginResize={onBeginResize}
          isSelected={event.id === selectedEventId}
        />
      ))}
    </div>
  );
}

function CalendarEventCard({ event, startHour, pxPerMinute, columnLayout, isDragging, isArmed, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, isSelected }: {
  event: CalendarEvent;
  startHour: number;
  pxPerMinute: number;
  columnLayout: { column: number; columns: number };
  isDragging: boolean;
  onPendingAction: WeekPlannerProps["onPendingAction"];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  isArmed: boolean;
  onBeginMove: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onBeginResize: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  isSelected: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const isUnavailable = event.kind === "unavailable";
  const isTournee = event.kind === "tournee";
  const isPending = event.kind === "pending";
  const isSelectable = Boolean(event.appointmentId || event.tourId || event.blockedSlotId);
  const isDraggable = Boolean(event.appointmentId);
  // Vraie durée, toujours : aucune hauteur minimale qui ferait croire qu'un
  // rendez-vous de 15 min en dure 45. Seul un plancher de lisibilité reste.
  const position = eventGeometry(toMinutes(event.start), event.duration, startHour, pxPerMinute);
  const height = Math.max(position.height, MIN_VISIBLE_HEIGHT);
  const inset = Math.min(3, height * 0.08);
  // Les boutons d'une demande en attente demandent de la place ; sur une
  // carte plus courte, la demande se traite depuis le panneau au-dessus de
  // la grille, la cloche ou sa fiche.
  const showPendingActions = isPending && height >= PENDING_ACTIONS_MIN_HEIGHT;
  const selectableLabel = isUnavailable
    ? `Ouvrir le créneau bloqué : ${event.title ?? "Indisponible"} à ${event.start}`
    : isTournee
      ? `Ouvrir la tournée ${event.title ?? ""} à ${event.start}`
      : isPending
        ? `Demande de rendez-vous pour ${event.animal ?? "l’animal"} à ${event.start}`
        : `Ouvrir le rendez-vous de ${event.animal ?? "l’animal"} à ${event.start}`;
  const { column, columns } = columnLayout;
  const columnWidthPercent = 100 / columns;

  function handleSelect() {
    if (!isSelectable || !articleRef.current) return;
    onSelectEvent(event, articleRef.current.getBoundingClientRect());
  }

  function handleKeyDown(keyboardEvent: React.KeyboardEvent) {
    if (!isSelectable) return;
    if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
      keyboardEvent.preventDefault();
      handleSelect();
    }
  }

  function handlePointerDown(pointerEvent: React.PointerEvent) {
    if (!isDraggable || pointerEvent.button !== 0) return;
    onBeginMove(event, pointerEvent);
  }

  function handleResizePointerDown(pointerEvent: React.PointerEvent) {
    if (!isDraggable) return;
    pointerEvent.stopPropagation();
    onBeginResize(event, pointerEvent);
  }

  return (
    <article
      ref={articleRef}
      // Une demande en attente porte ses propres boutons (accepter, décaler,
      // refuser) : un bouton dans un bouton, les lecteurs d'écran ne
      // l'annoncent pas. La carte devient alors un simple groupe nommé, et
      // « Décaler » ouvre la fiche au clavier. Le clic sur la carte reste.
      role={isSelectable ? (showPendingActions ? "group" : "button") : undefined}
      tabIndex={isSelectable && !showPendingActions ? 0 : undefined}
      onClick={isSelectable ? handleSelect : undefined}
      onKeyDown={isSelectable && !showPendingActions ? handleKeyDown : undefined}
      onPointerDown={isDraggable ? handlePointerDown : undefined}
      aria-label={isSelectable ? selectableLabel : undefined}
      className={`group absolute overflow-hidden rounded-xl border-l-4 p-1.5 leading-tight shadow-[0_4px_12px_rgb(var(--theme-shadow-rgb)/0.08)] transition ${eventStyles[event.kind]} ${
        isSelectable ? "outline-none hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgb(var(--theme-shadow-rgb)/0.16)] focus-visible:ring-2 focus-visible:ring-animeo-dark" : ""
      } ${isDraggable ? "cursor-grab active:cursor-grabbing" : isSelectable ? "cursor-pointer" : ""} ${isSelected ? "-translate-y-0.5 scale-[1.02] ring-2 ring-animeo-dark ring-offset-1" : ""} ${isDragging ? "opacity-30" : ""} ${isArmed ? "scale-[1.04] shadow-[0_14px_28px_rgb(var(--theme-shadow-rgb)/0.28)] ring-2 ring-animeo ring-offset-2" : ""}`}
      data-drag-armed={isArmed ? "true" : undefined}
      data-testid="agenda-event"
      style={{
        top: position.top + inset,
        height: height - inset * 2,
        left: `calc(${column * columnWidthPercent}% + 3px)`,
        width: `calc(${columnWidthPercent}% - 6px)`,
        // Cible tactile WCAG (24px) : sur des créneaux très chargés, la largeur
        // calculée par colonne peut descendre bien en-dessous — AUDIT_COMPLET.md
        // P3-30. minWidth prime sur width sans casser le calcul par pourcentage
        // dans les cas normaux ; les puces les plus à droite passent visuellement
        // par-dessus leurs voisines de gauche (index z croissant par colonne),
        // comme dans Google Calendar/Outlook.
        minWidth: "24px",
        zIndex: isSelected ? 30 : 10 + column,
        // Un appui long sur du texte déclenche sinon la sélection et le menu
        // système du navigateur mobile, qui annulent le pointeur en cours :
        // l'armement du déplacement n'atteignait jamais son délai.
        userSelect: "none",
        WebkitUserSelect: "none",
        WebkitTouchCallout: "none",
        touchAction: "manipulation",
      }}
    >
      <p className="text-[10px] font-black">{event.start}</p>
      <p className="mt-0.5 truncate text-xs font-extrabold">
        {isUnavailable || isTournee ? event.title : event.animal}
      </p>
      {event.client ? <p className="truncate text-[10px] font-bold">{event.client}</p> : null}
      {/* Sans opacité sur ces deux lignes : appliquée à un texte de 10 px sur
          une pastille colorée, elle les faisait passer sous le seuil de
          contraste AA. Elles héritent désormais de la couleur de la pastille,
          déjà vérifiée. */}
      {event.location ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[10px] font-semibold">
          {isTournee ? <Icon name="tournees" className="h-3 w-3 shrink-0" /> : null}
          {event.kind === "cabinet" ? <Icon name="home" className="h-3 w-3 shrink-0" /> : null}
          {event.kind === "domicile" ? <Icon name="car" className="h-3 w-3 shrink-0" /> : null}
          {event.location}
        </p>
      ) : null}

      {showPendingActions ? (
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <button
            type="button"
            title="Accepter"
            aria-label="Accepter le rendez-vous"
            onClick={(clickEvent) => { clickEvent.stopPropagation(); onPendingAction("Accepté", event); }}
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-animeo-warning transition hover:bg-animeo hover:text-white"
          >
            ✓
          </button>
          <button
            type="button"
            title="Décaler"
            aria-label="Décaler le rendez-vous"
            onClick={(clickEvent) => { clickEvent.stopPropagation(); handleSelect(); }}
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-animeo-warning transition hover:bg-white hover:text-animeo-dark"
          >
            ↔
          </button>
          <button
            type="button"
            title="Refuser"
            aria-label="Refuser le rendez-vous"
            onClick={(clickEvent) => { clickEvent.stopPropagation(); onPendingAction("Refusé", event); }}
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-animeo-warning transition hover:bg-animeo-error hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}

      {isDraggable ? (
        <div
          onPointerDown={handleResizePointerDown}
          aria-hidden="true"
          className="absolute inset-x-0 bottom-0 z-10 flex h-3 cursor-ns-resize items-end justify-center opacity-0 transition group-hover:opacity-100"
        >
          <div className="mb-0.5 h-[3px] w-6 rounded-full bg-current opacity-60" />
        </div>
      ) : null}
    </article>
  );
}
