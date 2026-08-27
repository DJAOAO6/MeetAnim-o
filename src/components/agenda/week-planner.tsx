"use client";

import { useMemo, useRef, useState } from "react";
import { AgendaEventPopover } from "@/components/agenda/agenda-event-popover";
import { useAppointments } from "@/components/appointments/appointments-context";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { computeClosedRanges, getDayAvailability } from "@/lib/availability";
import type { ClientPickerOption } from "@/data/clients";
import type { AvailabilitySettings } from "@/data/settings";

type EventKind = "cabinet" | "domicile" | "pending" | "unavailable" | "tournee";

export type CalendarEvent = {
  id: string;
  appointmentId?: string;
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
  showEvents: boolean;
  clients: ClientPickerOption[];
  availability: AvailabilitySettings;
  onPendingAction: (action: string, event: CalendarEvent) => void;
  localEvents?: CalendarEvent[];
  appointmentEvents?: CalendarEvent[];
};

const START_HOUR = 7;
const END_HOUR = 19;
const HOUR_HEIGHT = 72;
const PLANNER_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;
const MIN_EVENT_HEIGHT = 64;
const MIN_PENDING_HEIGHT = 100;

const events: CalendarEvent[] = [
  { id: "tour-rouen", day: 1, start: "13:00", duration: 150, kind: "tournee", title: "Tournée Rouen Ouest", location: "4 rendez-vous" },
  { id: "tour-le-havre", day: 4, start: "07:30", duration: 180, kind: "tournee", title: "Tournée Le Havre", location: "5 rendez-vous" },
];

const eventStyles: Record<EventKind, string> = {
  cabinet: "border-[#4FAF9F] bg-[#E5F4F0] text-animeo-dark",
  domicile: "border-[#4C8190] bg-[#E8F1F4] text-[#234E5A]",
  pending: "border-dashed border-animeo-accent bg-[#FFF4DD]/55 text-[#7E5718] backdrop-blur-[1px]",
  unavailable: "border-[#AEB8BB] bg-[#F1F3F3] text-[#59666B]",
  tournee: "border-[#8067B0] bg-[#EEEAF8] text-[#55417F]",
};

const legend = [
  { label: "Cabinet", color: "bg-animeo" },
  { label: "Domicile", color: "bg-[#4C8190]" },
  { label: "En attente", color: "bg-animeo-accent" },
  { label: "Tournée", color: "bg-[#8067B0]" },
  { label: "Fermé", color: "bg-[#AEB8BB]" },
];

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function getEventPosition(start: string, duration: number, minHeight: number) {
  const [hours, minutes] = start.split(":").map(Number);
  const minutesAfterStart = (hours - START_HOUR) * 60 + minutes;

  return {
    top: (minutesAfterStart / 60) * HOUR_HEIGHT,
    height: Math.max((duration / 60) * HOUR_HEIGHT, minHeight),
  };
}

function isReferenceDay(date: Date) {
  const today = new Date();
  return date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate();
}

export function WeekPlanner({ dates, showEvents, clients, availability, onPendingAction, localEvents = [], appointmentEvents = [] }: WeekPlannerProps) {
  const { appointments, saveAppointment } = useAppointments();
  const [selection, setSelection] = useState<{ event: CalendarEvent; anchorRect: DOMRect } | null>(null);
  const isDayView = dates.length === 1;
  const gridTemplateColumns = `70px repeat(${dates.length}, minmax(0,1fr))`;

  function handleSelectEvent(event: CalendarEvent, anchorRect: DOMRect) {
    setSelection({ event, anchorRect });
  }

  function closeSelection() {
    setSelection(null);
  }

  const selectedAppointment = selection?.event.appointmentId
    ? appointments.find((item) => item.id === selection.event.appointmentId)
    : undefined;

  return (
    <>
      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-[#e5eeeb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-extrabold text-animeo-dark">{isDayView ? "Planning du jour" : "Planning de la semaine"}</h2>
            <p className="mt-0.5 text-xs text-animeo-muted">Horaires affichés de 07h00 à 19h00</p>
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

        <div className="overflow-x-auto">
          <div className={isDayView ? "" : "min-w-[980px]"}>
            <div className="grid border-b border-[#dfe9e6] bg-[#fbfdfc]" style={{ gridTemplateColumns }}>
              <div className="border-r border-[#dfe9e6]" />
              {dates.map((date) => {
                const active = isReferenceDay(date);

                return (
                  <div key={date.toISOString()} className="border-r border-[#dfe9e6] px-2 py-3 text-center last:border-r-0">
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

            <div className="grid" style={{ gridTemplateColumns }}>
              <TimeColumn />
              {dates.map((date, dayIndex) => (
                <DayColumn
                  key={date.toISOString()}
                  date={date}
                  availability={availability}
                  events={[...(showEvents ? [...events, ...localEvents] : []), ...appointmentEvents].filter((event) => event.day === dayIndex)}
                  onPendingAction={onPendingAction}
                  onSelectEvent={handleSelectEvent}
                  selectedEventId={selection?.event.id ?? null}
                />
              ))}
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

function TimeColumn() {
  return (
    <div className="relative border-r border-[#dfe9e6] bg-[#fbfdfc]" style={{ height: PLANNER_HEIGHT }}>
      {Array.from({ length: END_HOUR - START_HOUR + 1 }, (_, index) => (
        <span
          key={index}
          className="absolute right-3 -translate-y-1/2 text-[11px] font-bold text-animeo-muted"
          style={{ top: index * HOUR_HEIGHT }}
        >
          {String(START_HOUR + index).padStart(2, "0")}:00
        </span>
      ))}
    </div>
  );
}

function DayColumn({ date, availability, events: dayEvents, onPendingAction, onSelectEvent, selectedEventId }: {
  date: Date;
  availability: AvailabilitySettings;
  events: CalendarEvent[];
  onPendingAction: WeekPlannerProps["onPendingAction"];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  selectedEventId: string | null;
}) {
  const dayAvailability = useMemo(() => getDayAvailability(date, availability), [date, availability]);
  const closedRanges = useMemo(
    () => (dayAvailability.open ? computeClosedRanges(dayAvailability.hourly, START_HOUR, END_HOUR) : [{ start: START_HOUR, end: END_HOUR }]),
    [dayAvailability],
  );

  return (
    <div
      className="relative border-r border-[#dfe9e6] last:border-r-0"
      style={{
        height: PLANNER_HEIGHT,
        backgroundImage: "linear-gradient(to bottom, transparent 35px, #edf2f0 36px, transparent 37px, transparent 71px, #dfe9e6 72px)",
        backgroundSize: `100% ${HOUR_HEIGHT}px`,
      }}
    >
      {closedRanges.map((range) => (
        <div
          key={`${range.start}-${range.end}`}
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 z-[1] bg-[repeating-linear-gradient(135deg,#F1F3F3,#F1F3F3_8px,#E7EBEA_8px,#E7EBEA_16px)]"
          style={{ top: (range.start - START_HOUR) * HOUR_HEIGHT, height: (range.end - range.start) * HOUR_HEIGHT }}
        >
          {!dayAvailability.open && range.start === START_HOUR && range.end === END_HOUR ? (
            <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white/85 px-3 py-1 text-[11px] font-black uppercase tracking-[0.08em] text-[#59666B]">
              Fermé
            </span>
          ) : null}
        </div>
      ))}

      {dayEvents.map((event) => (
        <CalendarEventCard
          key={event.id}
          event={event}
          onPendingAction={onPendingAction}
          onSelectEvent={onSelectEvent}
          isSelected={event.id === selectedEventId}
        />
      ))}
    </div>
  );
}

function CalendarEventCard({ event, onPendingAction, onSelectEvent, isSelected }: {
  event: CalendarEvent;
  onPendingAction: WeekPlannerProps["onPendingAction"];
  onSelectEvent: (event: CalendarEvent, anchorRect: DOMRect) => void;
  isSelected: boolean;
}) {
  const articleRef = useRef<HTMLElement>(null);
  const isUnavailable = event.kind === "unavailable";
  const isTournee = event.kind === "tournee";
  const isPending = event.kind === "pending";
  const isSelectable = Boolean(event.appointmentId);
  const position = getEventPosition(event.start, event.duration, isPending ? MIN_PENDING_HEIGHT : MIN_EVENT_HEIGHT);

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

  return (
    <article
      ref={articleRef}
      role={isSelectable ? "button" : undefined}
      tabIndex={isSelectable ? 0 : undefined}
      onClick={isSelectable ? handleSelect : undefined}
      onKeyDown={isSelectable ? handleKeyDown : undefined}
      aria-label={isSelectable ? `Ouvrir le rendez-vous de ${event.animal ?? "l’animal"} à ${event.start}` : undefined}
      className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-xl border-l-4 p-1.5 leading-tight shadow-[0_4px_12px_rgba(24,59,69,0.08)] transition ${eventStyles[event.kind]} ${
        isSelectable ? "cursor-pointer outline-none hover:-translate-y-0.5 hover:shadow-[0_10px_20px_rgba(24,59,69,0.16)] focus-visible:ring-2 focus-visible:ring-animeo-dark" : ""
      } ${isSelected ? "z-20 -translate-y-0.5 scale-[1.02] ring-2 ring-animeo-dark ring-offset-1" : ""}`}
      style={{ top: position.top + 3, height: position.height - 6 }}
    >
      <p className="text-[10px] font-black">{event.start}</p>
      <p className="mt-0.5 truncate text-xs font-extrabold">
        {isUnavailable || isTournee ? event.title : event.animal}
      </p>
      {event.client ? <p className="truncate text-[10px] font-bold opacity-75">{event.client}</p> : null}
      {event.location ? (
        <p className="mt-1 flex items-center gap-1 truncate text-[10px] font-semibold opacity-80">
          {isTournee ? <Icon name="tournees" className="h-3 w-3 shrink-0" /> : null}
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
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-[#7E5718] transition hover:bg-animeo hover:text-white"
          >
            ✓
          </button>
          <button
            type="button"
            title="Décaler"
            aria-label="Décaler le rendez-vous"
            onClick={(clickEvent) => { clickEvent.stopPropagation(); handleSelect(); }}
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-[#7E5718] transition hover:bg-white hover:text-animeo-dark"
          >
            ↔
          </button>
          <button
            type="button"
            title="Refuser"
            aria-label="Refuser le rendez-vous"
            onClick={(clickEvent) => { clickEvent.stopPropagation(); onPendingAction("Refusé", event); }}
            className="flex items-center justify-center rounded-md bg-white/85 py-1 text-xs font-black leading-none text-[#7E5718] transition hover:bg-animeo-error hover:text-white"
          >
            ✕
          </button>
        </div>
      ) : null}
    </article>
  );
}
