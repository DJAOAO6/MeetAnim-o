"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AgendaEventPopover } from "@/components/agenda/agenda-event-popover";
import { SlotSelectionLayer } from "@/components/agenda/slot-selection-layer";
import { selectionFromClick, toMinutes as slotToMinutes, type SelectionBounds, type SlotSelection } from "@/lib/agenda-selection";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { ArrowLeftRight, Ban, Check, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Clock, Home, MapPin, PawPrint, X } from "lucide-react";
import { computeClosedRanges, getDayAvailability, isHourClosed } from "@/lib/availability";
import { checkGeographicWarningAction } from "@/lib/appointments-actions";
import { computeEventColumns } from "@/lib/event-layout";
import { formatGeoWarningMessage } from "@/lib/tour-estimate";
import { notify } from "@/lib/notify";
import type { ClientPickerOption } from "@/data/clients";
import type { AvailabilitySettings } from "@/data/settings";
import { DEFAULT_AGENDA_DISPLAY, eventGeometry, eventsOutsideRange, pixelsPerMinute, rowHeightFor, type AgendaDisplay } from "@/lib/agenda-display";

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
  /** Vue Jour : passer au jour d'avant ou d'après depuis l'en-tête (téléphone). */
  onShiftDay?: (delta: number) => void;
};

const TIME_COLUMN_WIDTH = 56;
/**
 * Largeur minimale d'une colonne de jour. En deçà (tablette, barre latérale
 * ouverte), la grille défile latéralement dans sa carte plutôt que de
 * réduire les rendez-vous à une lettre ; l'axe des heures reste en place.
 */
const MIN_DAY_COLUMN_WIDTH = 92;
const SNAP_MINUTES = 15;
const DRAG_THRESHOLD_PX = 4;
// Tactile : le glissement n'est jamais armé au premier mouvement du doigt —
// un swipe destiné à faire défiler l'agenda déplaçait sinon le rendez-vous
// touché au départ, et changeait son horaire sans que rien ne le demande.
// Il faut un appui maintenu, immobile, avant que le déplacement devienne
// possible ; le défilement garde la priorité pendant tout ce délai.
const TOUCH_HOLD_MS = 500;
// Tolérance de tremblement pendant l'appui : au-delà, c'est un défilement.
const TOUCH_HOLD_TOLERANCE_PX = 8;

/** Plancher de lisibilité d'une carte, en pixels : en deçà, on ne voit plus rien. */
const MIN_VISIBLE_HEIGHT = 12;
/** Hauteur à partir de laquelle une demande en attente montre ses boutons. */
const PENDING_ACTIONS_MIN_HEIGHT = 72;
/**
 * Contenu d'une carte selon sa hauteur à l'écran : une ligne tronquée sous
 * TINY, l'heure et le nom jusqu'à FULL, tout le détail au-delà. Ce qui ne
 * tient pas reste lisible au survol (title) et dans le nom accessible.
 */
const TINY_EVENT_HEIGHT = 22;
const STACKED_EVENT_HEIGHT = 36;
const FULL_EVENT_HEIGHT = 48;

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
function selectionBoundsFor(startHour: number, endHour: number, step: number, dayEvents: CalendarEvent[]): SelectionBounds {
  return {
    dayStart: startHour * 60,
    dayEnd: endHour * 60,
    step: step > 0 ? step : 15,
    busy: dayEvents.map((event) => {
      const start = slotToMinutes(event.start);
      return { start, end: start + event.duration };
    }),
  };
}

function closedAtFor(dayAvailability: ReturnType<typeof getDayAvailability>) {
  return (minutes: number) => !dayAvailability.open || isHourClosed(dayAvailability.hourly, Math.floor(minutes / 60));
}

/** Millisecondes écoulées depuis `since` (0 : horodatage courant). Appelée au relâchement d'un geste, jamais au rendu. */
function elapsedSince(since: number): number {
  return performance.now() - since;
}

const cursorDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/** Mode du rendez-vous : une icône et un mot, jamais la couleur seule. */
const eventModes: Record<EventKind, { icon: typeof PawPrint; label: string }> = {
  cabinet: { icon: PawPrint, label: "Au cabinet" },
  domicile: { icon: Home, label: "À domicile" },
  tournee: { icon: MapPin, label: "Tournée" },
  pending: { icon: Clock, label: "Demande en attente" },
  unavailable: { icon: Ban, label: "Indisponible" },
};

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

/**
 * L'heure du navigateur, et seulement la sienne : nulle au rendu serveur,
 * dont l'horloge (et souvent le fuseau) diffère — sinon l'hydratation
 * échouerait sur le repère « maintenant ».
 */
function useCurrentTime(): Date | null {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    const first = setTimeout(tick, 0);
    const interval = setInterval(tick, 60000);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, []);
  return now;
}

type DragState =
  | { kind: "move"; event: CalendarEvent; originDay: number; originStartMinutes: number; grabOffsetMinutes: number; currentDay: number; currentStartMinutes: number }
  | { kind: "resize"; event: CalendarEvent; originDuration: number; currentDuration: number };

export function WeekPlanner({ dates, clients, availability, onPendingAction, onSelectTour, onSelectBlockedSlot, onSelectSlot, onClearSlot, activeSlot = null, appointmentEvents = [], tourEvents = [], blockedEvents = [], display = DEFAULT_AGENDA_DISPLAY, onShiftDay }: WeekPlannerProps) {
  const { appointments, saveAppointment } = useAppointments();
  const [selection, setSelection] = useState<{ event: CalendarEvent; anchorRect: DOMRect } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isDayView = dates.length === 1;
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH}px repeat(${dates.length}, minmax(0,1fr))`;
  const minGridWidth = isDayView ? undefined : TIME_COLUMN_WIDTH + dates.length * MIN_DAY_COLUMN_WIDTH;

  // Défilement latéral : la grille défile dans son propre conteneur, et
  // l'en-tête des jours (collé en haut de la page, donc hors de ce
  // conteneur) suit par une simple translation — sans nouveau rendu.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const headerTrackRef = useRef<HTMLDivElement>(null);
  const headerCornerRef = useRef<HTMLDivElement>(null);
  function syncHeader() {
    const x = scrollerRef.current?.scrollLeft ?? 0;
    if (headerTrackRef.current) headerTrackRef.current.style.transform = x ? `translateX(${-x}px)` : "";
    if (headerCornerRef.current) headerCornerRef.current.style.transform = x ? `translateX(${x}px)` : "";
  }
  // Semaine trop large pour l'écran : aujourd'hui, s'il y figure, est amené
  // en première colonne visible.
  const firstDateId = dates.length ? dateIdOf(dates[0]) : "";
  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;
    const today = dates.findIndex(isReferenceDay);
    const overflow = scroller.scrollWidth - scroller.clientWidth;
    scroller.scrollLeft = overflow > 0 && today > 0 ? Math.min(overflow, today * ((scroller.scrollWidth - TIME_COLUMN_WIDTH) / dates.length)) : 0;
    syncHeader();
    // Seulement quand la période change, pas à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firstDateId, dates.length]);
  const allEvents = useMemo(() => [...appointmentEvents, ...tourEvents, ...blockedEvents], [appointmentEvents, tourEvents, blockedEvents]);
  // Géométrie de la grille : la hauteur d'une ligne vient de la densité, sa
  // durée de l'intervalle. Les rendez-vous, eux, gardent leur vraie durée.
  const pxPerMinute = pixelsPerMinute(display);
  const hourHeight = pxPerMinute * 60;
  // La plage choisie, strictement : ce qui en sort est signalé dans sa colonne.
  const startHour = display.dayStart;
  const endHour = display.dayEnd;
  const plannerHeight = (endHour - startHour) * hourHeight;

  // Clavier : une case active dans la grille, déplacée aux flèches ; Entrée
  // ou Espace ouvre les mêmes actions qu'un clic.
  const [keyboardCursor, setKeyboardCursor] = useState<{ day: number; minutes: number } | null>(null);
  const regionRef = useRef<HTMLDivElement>(null);
  // Menu ouvert au clavier : à sa fermeture (Échap), le focus revient dans la
  // grille plutôt que de se perdre — sauf si une fenêtre l'a pris entre-temps —
  // et sur la case d'où le menu est parti, pas sur l'heure courante.
  const openedByKeyboardRef = useRef(false);
  const resumeCursorRef = useRef<{ day: number; minutes: number } | null>(null);
  // Focus reçu d'un clic de souris : pas de case clavier affichée. Elle
  // n'apparaît qu'au clavier (Tab, ou première flèche).
  const pointerFocusRef = useRef(false);
  useEffect(() => {
    if (activeSlot || !openedByKeyboardRef.current) return;
    openedByKeyboardRef.current = false;
    if (document.activeElement === document.body) regionRef.current?.focus();
  }, [activeSlot]);
  const keyboardHintId = useId();
  const cursorStep = display.slotMinutes;

  function dayContext(day: number) {
    const bounds = selectionBoundsFor(startHour, endHour, cursorStep, allEvents.filter((event) => event.day === day));
    return { bounds, closedAt: closedAtFor(getDayAvailability(dates[day], availability)) };
  }

  function initialKeyboardCursor() {
    const today = dates.findIndex(isReferenceDay);
    const current = now ?? new Date();
    const nowMinutes = current.getHours() * 60 + current.getMinutes();
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
    if (event.target !== event.currentTarget) return;
    if (!keyboardCursor) {
      if (!["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      setKeyboardCursor(initialKeyboardCursor());
      return;
    }
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
    openedByKeyboardRef.current = true;
    resumeCursorRef.current = keyboardCursor;
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
  // Seul le clic émis au relâchement est ignoré : un rendez-vous lâché
  // ailleurs ne doit pas faire ignorer, bien plus tard, le clic sur une carte.
  const dragEndedAtRef = useRef(0);
  // Rendez-vous dont le déplacement tactile est armé : sert au retour visuel
  // « mode déplacement » et n'a aucun effet à la souris.
  const [armedEventId, setArmedEventId] = useState<string | null>(null);
  const releaseTouchScrollRef = useRef<(() => void) | null>(null);

  // Le verrou de défilement tactile vit sur window : un démontage pendant un
  // déplacement armé (changement de semaine, navigation) le laisserait actif
  // et figerait le défilement de la page.
  useEffect(() => () => { releaseTouchScrollRef.current?.(); }, []);

  function handleSelectEvent(event: CalendarEvent, anchorRect: DOMRect) {
    if (justDraggedRef.current) {
      justDraggedRef.current = false;
      if (elapsedSince(dragEndedAtRef.current) < 500) return;
    }
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
    dragEndedAtRef.current = elapsedSince(0);
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
        {/* Défilement vertical : celui de la page, pour que l'en-tête des
            jours reste collé en haut (sous la barre du téléphone). Défilement
            latéral : seulement quand les colonnes passeraient sous
            MIN_DAY_COLUMN_WIDTH, dans le conteneur de la grille. */}
        <div
          ref={regionRef}
          role="region"
          aria-label={isDayView ? "Planning du jour" : "Planning de la semaine"}
          aria-describedby={keyboardHintId}
          tabIndex={0}
          onPointerDownCapture={() => { pointerFocusRef.current = true; }}
          onFocus={(event) => {
            const fromPointer = pointerFocusRef.current;
            pointerFocusRef.current = false;
            if (event.target !== event.currentTarget || keyboardCursor || fromPointer) return;
            setKeyboardCursor(resumeCursorRef.current ?? initialKeyboardCursor());
            resumeCursorRef.current = null;
          }}
          onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setKeyboardCursor(null); }}
          onKeyDown={handleGridKeyDown}
          className="relative outline-none"
        >
          <p id={keyboardHintId} className="sr-only">Flèches : passer d’un créneau à l’autre. Entrée : actions du créneau.</p>
          <p aria-live="polite" className="sr-only">{keyboardCursor ? describeCursor(keyboardCursor) : ""}</p>
          <div>
            <div
              className="sticky top-16 z-[32] overflow-clip border-b border-animeo-border bg-animeo-surface-alt md:top-0"
              data-testid="agenda-day-header"
            >
              {isDayView && onShiftDay ? <DayStrip date={dates[0]} onShift={onShiftDay} /> : null}
              <div
                ref={headerTrackRef}
                className={`grid will-change-transform ${isDayView && onShiftDay ? "max-md:hidden" : ""}`}
                style={{ gridTemplateColumns, minWidth: minGridWidth }}
              >
              <div ref={headerCornerRef} className="relative z-[1] border-r border-animeo-border bg-animeo-surface-alt" />
              {dates.map((date) => {
                const active = isReferenceDay(date);

                return (
                  <div key={date.toISOString()} className="border-r border-animeo-border px-2 py-3 text-center last:border-r-0" data-testid="agenda-day-heading">
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
            </div>

            <div
              ref={scrollerRef}
              onScroll={minGridWidth ? syncHeader : undefined}
              // overflow-y-hidden : un défilement latéral ne doit jamais
              // ajouter un ascenseur vertical dans la carte.
              className={minGridWidth ? "overflow-x-auto overflow-y-hidden overscroll-x-contain" : undefined}
              data-testid="agenda-grid-scroller"
            >
            <div ref={gridRef} className="relative grid" style={{ gridTemplateColumns, minWidth: minGridWidth }}>
              <TimeColumn
                startHour={startHour}
                endHour={endHour}
                plannerHeight={plannerHeight}
                pxPerMinute={pxPerMinute}
                nowMinutes={now && dates.some(isReferenceDay) ? now.getHours() * 60 + now.getMinutes() : null}
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
                  rowHeight={rowHeightFor(display)}
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

const stripWeekdayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const stripDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

/**
 * Vue Jour sur téléphone : « ‹ Mar 22 · Mer 23 · Jeu 24 › » dans l'en-tête
 * collé, à portée de pouce, pour passer d'un jour à l'autre sans remonter à
 * la barre d'outils. Au-delà du téléphone, l'en-tête habituel reprend.
 */
function DayStrip({ date, onShift }: { date: Date; onShift: (delta: number) => void }) {
  const days = [-1, 0, 1].map((delta) => ({ delta, day: new Date(date.getFullYear(), date.getMonth(), date.getDate() + delta, 12) }));
  const arrow = "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-animeo-dark transition hover:bg-white";
  return (
    <nav aria-label="Changer de jour" className="flex items-center gap-1 px-1.5 py-1.5 md:hidden" data-testid="agenda-day-strip">
      <button type="button" aria-label="Jour précédent" onClick={() => onShift(-1)} className={arrow}>
        <ChevronLeft aria-hidden="true" className="h-5 w-5" />
      </button>
      <div className="grid flex-1 grid-cols-3 gap-1">
        {days.map(({ delta, day }) => {
          const current = delta === 0;
          const weekday = stripWeekdayFormatter.format(day).replace(".", "");
          const content = (
            <>
              <span className={`text-[11px] font-extrabold ${current ? "text-white" : "text-animeo-muted"}`}>{weekday.charAt(0).toUpperCase() + weekday.slice(1)}</span>
              <span className="text-sm font-black tabular-nums">{day.getDate()}</span>
              {isReferenceDay(day) && !current ? <span aria-hidden="true" className="h-1 w-1 rounded-full bg-animeo" /> : null}
            </>
          );
          const base = "flex min-h-11 items-center justify-center gap-1.5 rounded-xl";
          return current ? (
            <p key={delta} aria-current="date" className={`${base} bg-animeo text-white`}>
              <span className="sr-only">{stripDateFormatter.format(day)}</span>
              <span aria-hidden="true" className="contents">{content}</span>
            </p>
          ) : (
            <button key={delta} type="button" aria-label={`Afficher ${stripDateFormatter.format(day)}`} onClick={() => onShift(delta)} className={`${base} text-animeo-dark transition hover:bg-white`}>
              {content}
            </button>
          );
        })}
      </div>
      <button type="button" aria-label="Jour suivant" onClick={() => onShift(1)} className={arrow}>
        <ChevronRight aria-hidden="true" className="h-5 w-5" />
      </button>
    </nav>
  );
}

/** Heures de la grille : une étiquette par heure, de la première à la dernière. */
function timeLabels(startHour: number, endHour: number): number[] {
  const labels: number[] = [];
  for (let hour = startHour; hour <= endHour; hour += 1) labels.push(hour * 60);
  return labels;
}

function TimeColumn({ startHour, endHour, plannerHeight, pxPerMinute, nowMinutes }: { startHour: number; endHour: number; plannerHeight: number; pxPerMinute: number; nowMinutes: number | null }) {
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
      {/* Centrée sur sa ligne, sauf la première (sous la ligne) et la
          dernière (au-dessus) : aucune ne dépasse de la grille, ni ne passe
          sous l'en-tête des jours. */}
      {timeLabels(startHour, endHour).map((minutes, index, all) => (
        <span
          key={minutes}
          className={`absolute right-3 text-[11px] font-bold text-animeo-muted ${index === 0 ? "translate-y-0.5" : index === all.length - 1 ? "-translate-y-[calc(100%+2px)]" : "-translate-y-1/2"}`}
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

function DayColumn({ date, now, availability, startHour, endHour, plannerHeight, pxPerMinute, slotMinutes, rowHeight, showClosedZones, keyboardCursor, events: dayEvents, draggedEventId, armedEventId, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, selectedEventId, dayIndex, slotInterval, activeSlot, onSelectSlot, onClearSlot }: {
  date: Date;
  now: Date | null;
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
  activeSlot: SlotSelection | null;
  onSelectSlot?: (selection: SlotSelection, anchorRect: DOMRect, closed: boolean, pointerType: string, bounds: SelectionBounds) => void;
  onClearSlot?: () => void;
}) {
  const dayAvailability = useMemo(() => getDayAvailability(date, availability), [date, availability]);
  const closedRanges = useMemo(
    () => (dayAvailability.open ? computeClosedRanges(dayAvailability.hourly, startHour, endHour) : [{ start: startHour, end: endHour }]),
    [dayAvailability, startHour, endHour],
  );
  // Hors de la plage affichée : pas de carte, une pastille en haut ou en bas.
  const outside = useMemo(
    () => eventsOutsideRange({ dayStart: startHour, dayEnd: endHour }, dayEvents.map((event) => ({ event, start: toMinutes(event.start), end: toMinutes(event.start) + event.duration }))),
    [dayEvents, startHour, endHour],
  );
  const visibleEvents = useMemo(() => {
    const hidden = new Set([...outside.before, ...outside.after].map((item) => item.event.id));
    return dayEvents.filter((event) => !hidden.has(event.id));
  }, [dayEvents, outside]);
  const layout = useMemo(() => computeEventColumns(visibleEvents), [visibleEvents]);

  /**
   * Ce qui empêche de sélectionner : tout ce qui occupe déjà la colonne —
   * rendez-vous, tournées et créneaux bloqués. Un créneau tracé par-dessus
   * l'un d'eux serait refusé par le serveur ensuite ; autant ne pas le
   * laisser tracer.
   */
  const selectionBounds = useMemo(
    () => selectionBoundsFor(startHour, endHour, slotInterval, dayEvents),
    [startHour, endHour, slotInterval, dayEvents],
  );
  const closedAt = useMemo(() => closedAtFor(dayAvailability), [dayAvailability]);
  const nowMinutes = now ? now.getHours() * 60 + now.getMinutes() : -1;
  const showTimeLine = now !== null && isReferenceDay(date) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

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
          {/* Accent assombri vers le brun du texte : 3,4:1 sur la grille,
              quand l'accent pur n'atteint pas le contraste d'un repère. */}
          <span className="-ml-[4px] h-2 w-2 shrink-0 rounded-full bg-[color-mix(in_srgb,var(--theme-accent)_70%,var(--theme-text))] ring-2 ring-white" />
          <div className="h-[2px] flex-1 bg-[color-mix(in_srgb,var(--theme-accent)_70%,var(--theme-text))]" />
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

      <OutsideRangeMarker position="before" items={outside.before.map((item) => item.event)} hour={startHour} onSelectEvent={onSelectEvent} />
      <OutsideRangeMarker position="after" items={outside.after.map((item) => item.event)} hour={endHour} onSelectEvent={onSelectEvent} />

      {visibleEvents.map((event) => (
        <CalendarEventCard
          key={event.id}
          event={event}
          startHour={startHour}
          plannerHeight={plannerHeight}
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

/**
 * Rendez-vous avant ou après la plage affichée : une pastille au bord de la
 * colonne (« 1 RDV avant 09:00 »). Un clic ouvre le premier ; la plage se
 * règle dans « Affichage ».
 */
function OutsideRangeMarker({ position, items, hour, onSelectEvent }: {
  position: "before" | "after";
  items: CalendarEvent[];
  hour: number;
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
}) {
  if (items.length === 0) return null;
  const sorted = [...items].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
  const first = sorted[0];
  const time = minutesToTime(hour * 60);
  const MarkerIcon = position === "before" ? ChevronUp : ChevronDown;
  const name = first.animal ?? first.title ?? "rendez-vous";
  return (
    <button
      type="button"
      onClick={(clickEvent) => onSelectEvent(first, clickEvent.currentTarget.getBoundingClientRect())}
      aria-label={`${items.length} rendez-vous ${position === "before" ? "avant" : "après"} ${time}, hors des horaires affichés : ouvrir ${name} à ${first.start}`}
      title={sorted.map((item) => `${item.start} ${item.animal ?? item.title ?? ""}`).join("\n")}
      data-testid="agenda-outside-range"
      className={`absolute inset-x-1 z-[25] flex min-h-6 items-center justify-center gap-1 rounded-md border border-animeo-border bg-white/95 px-1 text-[10px] font-extrabold text-animeo-dark shadow-sm transition hover:border-animeo ${position === "before" ? "top-1" : "bottom-1"}`}
    >
      <MarkerIcon aria-hidden="true" className="h-3 w-3 shrink-0" strokeWidth={2.5} />
      <span className="truncate">{items.length} RDV {position === "before" ? "avant" : "après"} {time}</span>
    </button>
  );
}

function CalendarEventCard({ event, startHour, plannerHeight, pxPerMinute, columnLayout, isDragging, isArmed, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, isSelected }: {
  event: CalendarEvent;
  startHour: number;
  plannerHeight: number;
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
  // À cheval sur le début ou la fin de la plage affichée : la carte est
  // coupée au bord de la grille (bord plat), son heure réelle reste écrite.
  const geometry = eventGeometry(toMinutes(event.start), event.duration, startHour, pxPerMinute);
  const clippedTop = geometry.top < 0;
  const clippedBottom = geometry.top + geometry.height > plannerHeight;
  const visibleTop = Math.max(0, geometry.top);
  const position = { top: visibleTop, height: Math.min(plannerHeight, geometry.top + geometry.height) - visibleTop };
  const height = Math.max(position.height, MIN_VISIBLE_HEIGHT);
  const inset = Math.min(3, height * 0.08);
  // Les boutons d'une demande en attente demandent de la place ; sur une
  // carte plus courte, la demande se traite depuis le panneau au-dessus de
  // la grille, la cloche ou sa fiche.
  // Partagée avec un autre rendez-vous, la carte est trop étroite pour trois
  // boutons lisibles : un clic l'ouvre, comme les autres.
  const showPendingActions = isPending && height >= PENDING_ACTIONS_MIN_HEIGHT && columnLayout.columns === 1;
  const selectableLabel = isUnavailable
    ? `Ouvrir le créneau bloqué : ${event.title ?? "Indisponible"} à ${event.start}`
    : isTournee
      ? `Ouvrir la tournée ${event.title ?? ""} à ${event.start}`
      : isPending
        ? `Demande de rendez-vous pour ${event.animal ?? "l’animal"} à ${event.start}`
        : `Ouvrir le rendez-vous de ${event.animal ?? "l’animal"} à ${event.start}`;
  const { column, columns } = columnLayout;
  const columnWidthPercent = 100 / columns;
  const mode = eventModes[event.kind];
  const ModeIcon = mode.icon;
  const name = (isUnavailable || isTournee ? event.title : event.animal) ?? mode.label;
  const end = minutesToTime(toMinutes(event.start) + event.duration);
  const visualHeight = height - inset * 2;
  const size = visualHeight < TINY_EVENT_HEIGHT ? "tiny" : visualHeight < FULL_EVENT_HEIGHT ? "medium" : "full";
  // Une ligne n'apparaît que si elle tient entière, boutons d'une demande compris.
  const showClient = visualHeight >= 54 && (!showPendingActions || visualHeight >= 86);
  const showLocation = visualHeight >= 68 && !showPendingActions;
  // Tout ce que la carte ne montre pas faute de place, en bulle au survol.
  const summary = [`${event.start} – ${end}`, name, event.client, mode.label, event.location].filter(Boolean).join(" · ");

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
      // Tout ce que la carte peut taire faute de place : fin, mode, client.
      aria-label={isSelectable ? `${selectableLabel}, jusqu’à ${end}, ${mode.label.toLowerCase()}${event.client ? `, ${event.client}` : ""}` : undefined}
      title={size === "full" && showLocation && columnLayout.columns === 1 ? undefined : summary}
      data-size={size}
      className={`@container group absolute overflow-hidden border-l-4 leading-tight ${size === "tiny" ? "rounded-md px-1.5" : "rounded-lg px-1.5 py-1"} ${clippedTop ? "rounded-t-none" : ""} ${clippedBottom ? "rounded-b-none" : ""} shadow-[0_4px_12px_rgb(var(--theme-shadow-rgb)/0.08)] transition ${eventStyles[event.kind]} ${
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
      {size === "tiny" ? (
        <p className="flex h-full items-center gap-1 truncate text-[10px] font-extrabold">
          {/* Carte étroite : le nom d'abord, l'heure se lit sur la grille. */}
          <span className="hidden font-black tabular-nums @min-[5.5rem]:inline">{event.start}</span>
          <span className="truncate">{name}</span>
        </p>
      ) : size === "medium" ? (
        <div className={visualHeight >= STACKED_EVENT_HEIGHT ? "" : "flex items-baseline gap-1.5"}>
          <p className={`text-[10px] font-black tabular-nums ${visualHeight >= STACKED_EVENT_HEIGHT ? "hidden @min-[3rem]:block" : "hidden @min-[5.5rem]:block"}`}>{event.start}</p>
          <p className="truncate text-xs font-extrabold">{name}</p>
        </div>
      ) : (
        <>
          <div className="flex items-center gap-1.5">
            {/* Largeur de la carte, pas de l'écran : l'heure de fin et l'icône
                n'apparaissent que si elles tiennent sans être coupées. */}
            <p className="hidden min-w-0 flex-1 truncate text-[10px] font-black tabular-nums @min-[3rem]:block">
              {event.start}<span className="hidden @min-[8.5rem]:inline"> – {end}</span>
            </p>
            <ModeIcon aria-hidden="true" className="hidden h-3.5 w-3.5 shrink-0 @min-[4.5rem]:block" strokeWidth={2.25} />
          </div>
          <p className="mt-0.5 truncate text-xs font-extrabold">{name}</p>
          {/* Sans opacité sur ces lignes : appliquée à un texte de 10 px sur
              une pastille colorée, elle les faisait passer sous le seuil de
              contraste AA. Elles héritent de la couleur de la pastille. */}
          {event.client && showClient ? <p className="truncate text-[10px] font-bold">{event.client}</p> : null}
          {showLocation ? <p className="mt-0.5 truncate text-[10px] font-semibold">{event.location ?? mode.label}</p> : null}
        </>
      )}

      {showPendingActions ? (
        <div className="mt-1.5 grid grid-cols-3 gap-1">
          <PendingButton label="Accepter le rendez-vous" icon={Check} tone="hover:bg-animeo hover:text-white" onClick={() => onPendingAction("Accepté", event)} />
          <PendingButton label="Décaler le rendez-vous" icon={ArrowLeftRight} tone="hover:bg-white hover:text-animeo-dark" onClick={handleSelect} />
          <PendingButton label="Refuser le rendez-vous" icon={X} tone="hover:bg-animeo-error hover:text-white" onClick={() => onPendingAction("Refusé", event)} />
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

function PendingButton({ label, icon: ButtonIcon, tone, onClick }: { label: string; icon: typeof Check; tone: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={label.replace(" le rendez-vous", "")}
      aria-label={label}
      onClick={(clickEvent) => { clickEvent.stopPropagation(); onClick(); }}
      className={`flex items-center justify-center rounded-md bg-white/85 py-1 text-animeo-warning transition ${tone}`}
    >
      <ButtonIcon aria-hidden="true" className="h-3.5 w-3.5" strokeWidth={2.75} />
    </button>
  );
}
