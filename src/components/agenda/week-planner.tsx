"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AgendaEventPopover } from "@/components/agenda/agenda-event-popover";
import { SlotSelectionLayer } from "@/components/agenda/slot-selection-layer";
import { toMinutes as slotToMinutes, type SelectionBounds, type SlotSelection } from "@/lib/agenda-selection";
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
};

const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 19;
const MIN_START_HOUR = 6;
const MAX_END_HOUR = 23;
const HOUR_MARGIN = 1;
const HOUR_HEIGHT = 72;
const MIN_EVENT_HEIGHT = 64;
const MIN_PENDING_HEIGHT = 100;
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

/**
 * Plage horaire affichée dérivée des vraies disponibilités plutôt que
 * 07h-19h fixe : un rendez-vous après 19h sortait auparavant de la zone
 * visible du planning. Bornée à [MIN_START_HOUR, MAX_END_HOUR] pour éviter
 * un planning démesurément long avec une seule plage exotique configurée.
 */
function computeHourRange(availability: AvailabilitySettings): { startHour: number; endHour: number } {
  let earliest = Infinity;
  let latest = -Infinity;

  for (const day of availability.days) {
    if (!day.enabled) continue;
    for (const slot of day.slots) {
      const [startH] = slot.start.split(":").map(Number);
      const [endH, endM] = slot.end.split(":").map(Number);
      earliest = Math.min(earliest, startH);
      latest = Math.max(latest, endH + (endM > 0 ? 1 : 0));
    }
  }

  if (!Number.isFinite(earliest) || !Number.isFinite(latest)) {
    return { startHour: DEFAULT_START_HOUR, endHour: DEFAULT_END_HOUR };
  }

  const startHour = Math.max(MIN_START_HOUR, Math.floor(earliest) - HOUR_MARGIN);
  const endHour = Math.min(MAX_END_HOUR, Math.ceil(latest) + HOUR_MARGIN);
  return { startHour, endHour: Math.max(endHour, startHour + 1) };
}

const eventStyles: Record<EventKind, string> = {
  cabinet: "border-animeo-brand bg-animeo-positive-soft text-animeo-dark",
  domicile: "border-[#4C8190] bg-animeo-info-soft text-[#234E5A]",
  pending: "border-dashed border-animeo-accent bg-animeo-warning-soft/55 text-animeo-warning backdrop-blur-[1px]",
  unavailable: "border-animeo-subtle bg-animeo-surface-alt text-animeo-muted",
  tournee: "border-[#8067B0] bg-[#EEEAF8] text-[#55417F]",
};

const legend = [
  { label: "Cabinet", color: "bg-animeo" },
  { label: "Domicile", color: "bg-[#4C8190]" },
  { label: "En attente", color: "bg-animeo-accent" },
  { label: "Tournée", color: "bg-[#8067B0]" },
  { label: "Fermé", color: "bg-animeo-subtle" },
];

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });
const dragDateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

function getEventPosition(start: string, duration: number, minHeight: number, startHour: number) {
  const [hours, minutes] = start.split(":").map(Number);
  const minutesAfterStart = (hours - startHour) * 60 + minutes;

  return {
    top: (minutesAfterStart / 60) * HOUR_HEIGHT,
    height: Math.max((duration / 60) * HOUR_HEIGHT, minHeight),
  };
}

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

export function WeekPlanner({ dates, clients, availability, onPendingAction, onSelectTour, onSelectBlockedSlot, onSelectSlot, onClearSlot, activeSlot = null, appointmentEvents = [], tourEvents = [], blockedEvents = [] }: WeekPlannerProps) {
  const { appointments, saveAppointment } = useAppointments();
  const [selection, setSelection] = useState<{ event: CalendarEvent; anchorRect: DOMRect } | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const isDayView = dates.length === 1;
  const gridTemplateColumns = `${TIME_COLUMN_WIDTH}px repeat(${dates.length}, minmax(0,1fr))`;
  const { startHour, endHour } = useMemo(() => computeHourRange(availability), [availability]);
  const plannerHeight = (endHour - startHour) * HOUR_HEIGHT;
  const allEvents = useMemo(() => [...appointmentEvents, ...tourEvents, ...blockedEvents], [appointmentEvents, tourEvents, blockedEvents]);
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
    const pointerAbsoluteMinutesAtStart = startHour * 60 + ((startClientY - gridTop) / HOUR_HEIGHT) * 60;
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
      const pointerAbsoluteMinutes = startHour * 60 + ((moveEvent.clientY - gridRect.top) / HOUR_HEIGHT) * 60;
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
      const deltaMinutes = Math.round(((moveEvent.clientY - startClientY) / HOUR_HEIGHT) * 60 / SNAP_MINUTES) * SNAP_MINUTES;
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
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-animeo-border-soft px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold text-animeo-dark">{isDayView ? "Planning du jour" : "Planning de la semaine"}</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">Horaires affichés de {String(startHour).padStart(2, "0")}h00 à {String(endHour).padStart(2, "0")}h00 · glissez un rendez-vous pour le replanifier · sur mobile, appui long avant de déplacer</p>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-2" aria-label="Légende du planning">
            {legend.map((item) => (
              <div key={item.label} className="flex items-center gap-2 text-xs font-bold text-animeo-muted">
                <span className={`h-2.5 w-2.5 rounded-full ${item.color}`} />
                {item.label}
              </div>
            ))}
          </div>
        </div>

        {/* Pas de min-w forcé : les colonnes de jour (minmax(0,1fr) dans
            gridTemplateColumns) se répartissent sur toute la largeur
            réellement disponible plutôt que de forcer un défilement
            horizontal dès que cette largeur descend sous un seuil arbitraire
            — c'est justement ce qui coupait Samedi/Dimanche sur les largeurs
            de portable courantes. Le dégradé ci-dessous reste en filet de
            sécurité pour le cas extrême (très petit écran) où un
            défilement resterait malgré tout nécessaire. */}
        {/* Zone défilante atteignable au clavier : sans tabIndex, une semaine
            sans rendez-vous n'a rien de focalisable, et ne peut donc pas
            défiler sans souris (axe : scrollable-region-focusable). */}
        <div
          tabIndex={0}
          role="region"
          aria-label={isDayView ? "Planning du jour" : "Planning de la semaine"}
          className="relative overflow-x-auto outline-none focus-visible:ring-2 focus-visible:ring-animeo-dark focus-visible:ring-offset-2"
        >
          {!isDayView ? <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 z-20 w-8 bg-gradient-to-l from-white to-transparent sm:hidden" /> : null}
          <div>
            <div className="grid border-b border-animeo-border bg-animeo-surface-alt" style={{ gridTemplateColumns }}>
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
              <TimeColumn startHour={startHour} endHour={endHour} plannerHeight={plannerHeight} />
              {dates.map((date, dayIndex) => (
                <DayColumn
                  key={date.toISOString()}
                  date={date}
                  now={now}
                  availability={availability}
                  startHour={startHour}
                  endHour={endHour}
                  plannerHeight={plannerHeight}
                  events={allEvents.filter((event) => event.day === dayIndex)}
                  draggedEventId={drag?.event.id ?? null}
                  armedEventId={armedEventId}
                  onPendingAction={onPendingAction}
                  onSelectEvent={handleSelectEvent}
                  onBeginMove={beginMove}
                  onBeginResize={beginResize}
                  selectedEventId={selection?.event.id ?? null}
                  slotInterval={availability.slotInterval}
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
                    top: (((drag.kind === "move" ? drag.currentStartMinutes : toMinutes(drag.event.start)) - startHour * 60) / 60) * HOUR_HEIGHT,
                    height: ((drag.kind === "resize" ? drag.currentDuration : drag.event.duration) / 60) * HOUR_HEIGHT,
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

function TimeColumn({ startHour, endHour, plannerHeight }: { startHour: number; endHour: number; plannerHeight: number }) {
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
      {Array.from({ length: endHour - startHour + 1 }, (_, index) => (
        <span
          key={index}
          className="absolute right-3 -translate-y-1/2 text-[11px] font-bold text-animeo-muted"
          style={{ top: index * HOUR_HEIGHT }}
        >
          {String(startHour + index).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

function DayColumn({ date, now, availability, startHour, endHour, plannerHeight, events: dayEvents, draggedEventId, armedEventId, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, selectedEventId, dayIndex, slotInterval, defaultDuration, activeSlot, onSelectSlot, onClearSlot }: {
  date: Date;
  now: Date;
  availability: AvailabilitySettings;
  startHour: number;
  endHour: number;
  plannerHeight: number;
  events: CalendarEvent[];
  draggedEventId: string | null;
  onPendingAction: WeekPlannerProps["onPendingAction"];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  armedEventId: string | null;
  onBeginMove: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  onBeginResize: (event: CalendarEvent, pointerEvent: React.PointerEvent) => void;
  selectedEventId: string | null;
  dayIndex: number;
  /** Pas de temps réglé dans Disponibilités — jamais une granularité inventée ici. */
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
  const selectionBounds = useMemo<SelectionBounds>(() => ({
    dayStart: startHour * 60,
    dayEnd: endHour * 60,
    step: slotInterval > 0 ? slotInterval : 15,
    defaultDuration: defaultDuration > 0 ? defaultDuration : 45,
    busy: dayEvents.map((event) => {
      const start = slotToMinutes(event.start);
      return { start, end: start + event.duration };
    }),
  }), [startHour, endHour, slotInterval, defaultDuration, dayEvents]);

  const closedAt = useMemo(() => (minutes: number) => {
    if (!dayAvailability.open) return true;
    return isHourClosed(dayAvailability.hourly, Math.floor(minutes / 60));
  }, [dayAvailability]);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const showTimeLine = isReferenceDay(date) && nowMinutes >= startHour * 60 && nowMinutes <= endHour * 60;

  return (
    <div
      className="relative border-r border-animeo-border last:border-r-0"
      style={{
        height: plannerHeight,
        backgroundImage: "linear-gradient(to bottom, transparent 35px, #edf2f0 36px, transparent 37px, transparent 71px, #dfe9e6 72px)",
        backgroundSize: `100% ${HOUR_HEIGHT}px`,
      }}
    >
      {showTimeLine ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-30 flex items-center"
          style={{ top: ((nowMinutes - startHour * 60) / 60) * HOUR_HEIGHT }}
        >
          <span className="-ml-[3px] h-2 w-2 shrink-0 rounded-full bg-animeo-error" />
          <div className="h-[2px] flex-1 bg-animeo-error" />
        </div>
      ) : null}

      {closedRanges.map((range) => (
        <div
          key={`${range.start}-${range.end}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] bg-[repeating-linear-gradient(135deg,#F1F3F3,#F1F3F3_8px,#E7EBEA_8px,#E7EBEA_16px)]"
          style={{ top: (range.start - startHour) * HOUR_HEIGHT, height: (range.end - range.start) * HOUR_HEIGHT }}
        >
          {!dayAvailability.open && range.start === startHour && range.end === endHour ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-animeo-muted">
              Fermé
            </span>
          ) : null}
        </div>
      ))}

      {onSelectSlot ? (
        <SlotSelectionLayer
          dayIndex={dayIndex}
          bounds={selectionBounds}
          hourHeight={HOUR_HEIGHT}
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

function CalendarEventCard({ event, startHour, columnLayout, isDragging, isArmed, onPendingAction, onSelectEvent, onBeginMove, onBeginResize, isSelected }: {
  event: CalendarEvent;
  startHour: number;
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
  const position = getEventPosition(event.start, event.duration, isPending ? MIN_PENDING_HEIGHT : MIN_EVENT_HEIGHT, startHour);
  const selectableLabel = isUnavailable
    ? `Ouvrir le créneau bloqué : ${event.title ?? "Indisponible"} à ${event.start}`
    : isTournee
      ? `Ouvrir la tournée ${event.title ?? ""} à ${event.start}`
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
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? handleSelect : undefined}
      onKeyDown={isSelectable ? handleKeyDown : undefined}
      onPointerDown={isDraggable ? handlePointerDown : undefined}
      aria-label={isSelectable ? selectableLabel : undefined}
      className={`group absolute overflow-hidden rounded-xl border-l-4 p-1.5 leading-tight shadow-[0_4px_12px_rgb(var(--theme-shadow-rgb)/0.08)] transition ${eventStyles[event.kind]} ${
        isSelectable ? "outline-none hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgb(var(--theme-shadow-rgb)/0.16)] focus-visible:ring-2 focus-visible:ring-animeo-dark" : ""
      } ${isDraggable ? "cursor-grab active:cursor-grabbing" : isSelectable ? "cursor-pointer" : ""} ${isSelected ? "-translate-y-0.5 scale-[1.02] ring-2 ring-animeo-dark ring-offset-1" : ""} ${isDragging ? "opacity-30" : ""} ${isArmed ? "scale-[1.04] shadow-[0_14px_28px_rgb(var(--theme-shadow-rgb)/0.28)] ring-2 ring-animeo ring-offset-2" : ""}`}
      data-drag-armed={isArmed ? "true" : undefined}
      data-testid="agenda-event"
      style={{
        top: position.top + 3,
        height: position.height - 6,
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

      {isPending ? (
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
