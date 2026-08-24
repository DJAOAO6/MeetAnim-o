import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

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
  onPendingAction: (action: string, event: CalendarEvent) => void;
  localEvents?: CalendarEvent[];
  appointmentEvents?: CalendarEvent[];
};

const START_HOUR = 7;
const END_HOUR = 19;
const HOUR_HEIGHT = 72;
const PLANNER_HEIGHT = (END_HOUR - START_HOUR) * HOUR_HEIGHT;

const events: CalendarEvent[] = [
  { id: "tour-rouen", day: 1, start: "13:00", duration: 150, kind: "tournee", title: "Tournée Rouen Ouest", location: "4 rendez-vous" },
  { id: "unavailable-personal", day: 2, start: "14:00", duration: 120, kind: "unavailable", title: "Indisponible", location: "Temps personnel" },
  { id: "tour-le-havre", day: 4, start: "07:30", duration: 180, kind: "tournee", title: "Tournée Le Havre", location: "5 rendez-vous" },
  { id: "unavailable-sunday", day: 6, start: "09:00", duration: 180, kind: "unavailable", title: "Indisponible", location: "Cabinet fermé" },
];

const eventStyles: Record<EventKind, string> = {
  cabinet: "border-[#4FAF9F] bg-[#E5F4F0] text-animeo-dark",
  domicile: "border-[#4C8190] bg-[#E8F1F4] text-[#234E5A]",
  pending: "border-animeo-accent bg-[#FFF4DD] text-[#7E5718]",
  unavailable: "border-[#AEB8BB] bg-[#F1F3F3] text-[#59666B]",
  tournee: "border-[#8067B0] bg-[#EEEAF8] text-[#55417F]",
};

const legend = [
  { label: "Cabinet", color: "bg-animeo" },
  { label: "Domicile", color: "bg-[#4C8190]" },
  { label: "En attente", color: "bg-animeo-accent" },
  { label: "Indisponible", color: "bg-[#AEB8BB]" },
  { label: "Tournée", color: "bg-[#8067B0]" },
];

const dayFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "short" });

function getEventPosition(start: string, duration: number) {
  const [hours, minutes] = start.split(":").map(Number);
  const minutesAfterStart = (hours - START_HOUR) * 60 + minutes;

  return {
    top: (minutesAfterStart / 60) * HOUR_HEIGHT,
    height: Math.max((duration / 60) * HOUR_HEIGHT, 44),
  };
}

function isReferenceDay(date: Date) {
  return date.getFullYear() === 2026 && date.getMonth() === 7 && date.getDate() === 24;
}

export function WeekPlanner({ dates, showEvents, onPendingAction, localEvents = [], appointmentEvents = [] }: WeekPlannerProps) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-[#e5eeeb] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-extrabold text-animeo-dark">Planning de la semaine</h2>
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
        <div className="min-w-[980px]">
          <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))] border-b border-[#dfe9e6] bg-[#fbfdfc]">
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

          <div className="grid grid-cols-[70px_repeat(7,minmax(0,1fr))]">
            <TimeColumn />
            {dates.map((date, dayIndex) => (
              <DayColumn
                key={date.toISOString()}
                events={[...(showEvents ? [...events, ...localEvents] : []), ...appointmentEvents].filter((event) => event.day === dayIndex)}
                onPendingAction={onPendingAction}
              />
            ))}
          </div>
        </div>
      </div>
    </Card>
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

function DayColumn({ events: dayEvents, onPendingAction }: {
  events: CalendarEvent[];
  onPendingAction: WeekPlannerProps["onPendingAction"];
}) {
  return (
    <div
      className="relative border-r border-[#dfe9e6] last:border-r-0"
      style={{
        height: PLANNER_HEIGHT,
        backgroundImage: "linear-gradient(to bottom, transparent 35px, #edf2f0 36px, transparent 37px, transparent 71px, #dfe9e6 72px)",
        backgroundSize: `100% ${HOUR_HEIGHT}px`,
      }}
    >
      {dayEvents.map((event) => (
        <CalendarEventCard key={event.id} event={event} onPendingAction={onPendingAction} />
      ))}
    </div>
  );
}

function CalendarEventCard({ event, onPendingAction }: {
  event: CalendarEvent;
  onPendingAction: WeekPlannerProps["onPendingAction"];
}) {
  const position = getEventPosition(event.start, event.duration);
  const isUnavailable = event.kind === "unavailable";
  const isTournee = event.kind === "tournee";

  return (
    <article
      className={`absolute left-1.5 right-1.5 z-10 overflow-hidden rounded-xl border-l-4 p-2 shadow-[0_4px_12px_rgba(24,59,69,0.08)] ${eventStyles[event.kind]}`}
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

      {event.kind === "pending" ? (
        <div className="mt-2 grid gap-0.5">
          {[
            { label: "Accepter", action: "Accepté" },
            { label: "Décaler", action: "Décalage demandé" },
            { label: "Refuser", action: "Refusé" },
          ].map((button) => (
            <button
              key={button.label}
              type="button"
              onClick={() => onPendingAction(button.action, event)}
              className="rounded-md bg-white/80 px-1 py-1 text-[9px] font-black leading-none transition hover:bg-white"
            >
              {button.label}
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}
