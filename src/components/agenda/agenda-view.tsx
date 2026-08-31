"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAppointments } from "@/components/appointments/appointments-context";
import { AgendaSidePanel } from "@/components/agenda/agenda-side-panel";
import { AgendaViewSwitcher, type AgendaViewMode } from "@/components/agenda/agenda-view-switcher";
import { AgendaFilterBar } from "@/components/agenda/agenda-filter-bar";
import { BlockedSlotModal } from "@/components/agenda/blocked-slot-modal";
import { BlockedSlotPopover } from "@/components/agenda/blocked-slot-popover";
import { DayDetailPanel } from "@/components/agenda/day-detail-panel";
import { MonthCalendarView, type MonthFilter } from "@/components/agenda/month-calendar-view";
import { TourDetailModal } from "@/components/agenda/tour-detail-modal";
import { WeekPlanner, type CalendarEvent } from "@/components/agenda/week-planner";
import { YearCalendarView, YearSidePanel, YearStatsRibbon } from "@/components/agenda/year-calendar-view";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { createBlockedSlotAction, deleteBlockedSlotAction, type BlockedSlot } from "@/lib/blocked-slots-actions";
import { notify } from "@/lib/notify";
import { deleteTourAction } from "@/lib/tours-actions";
import { tourRunsOnDate, weekdayLabelFor } from "@/lib/tour-schedule";
import type { ClientPickerOption } from "@/data/clients";
import type { AvailabilitySettings } from "@/data/settings";
import type { Coordinates, Tour, TourAppointment, Zone } from "@/data/tours";

const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getCurrentWeekMonday() {
  const now = new Date();
  const day = now.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMonday, 12);
}

function getWeekDates(offset: number) {
  const monday = getCurrentWeekMonday();
  return Array.from({ length: 7 }, (_, dayIndex) =>
    new Date(monday.getTime() + (offset * 7 + dayIndex) * DAY_IN_MS),
  );
}

function getDayDate(offset: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + offset, 12);
}

function getMonthDate(offset: number) {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth() + offset, 1, 12);
}

function getYearValue(offset: number) {
  return new Date().getFullYear() + offset;
}

function monthOffsetFor(year: number, monthIndex: number) {
  const now = new Date();
  return (year - now.getFullYear()) * 12 + (monthIndex - now.getMonth());
}

function formatWeekLabel(dates: Date[]) {
  const first = dates[0];
  const last = dates[dates.length - 1];
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });

  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${monthFormatter.format(last)} ${last.getFullYear()}`;
  }

  return `${first.getDate()} ${monthFormatter.format(first)} – ${last.getDate()} ${monthFormatter.format(last)} ${last.getFullYear()}`;
}

const dayLabelFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

function formatDayLabel(date: Date) {
  const label = dayLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

const monthLabelFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric" });

function formatMonthLabel(date: Date) {
  const label = monthLabelFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function dateId(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function minutesBetween(start: string, end: string) {
  const [startHours, startMinutes] = start.split(":").map(Number);
  const [endHours, endMinutes] = end.split(":").map(Number);
  return (endHours * 60 + endMinutes) - (startHours * 60 + startMinutes);
}

type PendingRequest = {
  id: string;
  appointmentId: string;
  date: string;
  start: string;
  animal: string;
  client: string;
  location: string;
};

type AgendaViewProps = {
  clients: ClientPickerOption[];
  availability: AvailabilitySettings;
  tours: Tour[];
  zones: Zone[];
  tourAppointments: Record<string, TourAppointment[]>;
  initialBlockedSlots: BlockedSlot[];
  cabinetCoordinates: Coordinates | null;
};

export function AgendaView({ clients, availability, tours, zones, tourAppointments, initialBlockedSlots, cabinetCoordinates }: AgendaViewProps) {
  const router = useRouter();
  const { appointments, openManager, openNewAppointment, updateAppointmentStatus } = useAppointments();
  const [view, setView] = useState<AgendaViewMode>("week");

  useEffect(() => {
    // Sur mobile, la vue Semaine impose un défilement horizontal peu
    // lisible : la vue Jour (déjà pensée pour un écran étroit) démarre par
    // défaut. Vérifié une seule fois au montage (après le premier rendu,
    // pour ne pas provoquer de désaccord d'hydratation) et ne doit jamais
    // écraser un choix de vue fait ensuite par l'utilisateur.
    const frame = requestAnimationFrame(() => {
      if (window.matchMedia("(max-width: 767px)").matches) setView("day");
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  const [filter, setFilter] = useState<MonthFilter>("all");
  const [selectedDay, setSelectedDay] = useState<Date | null>(null);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>(initialBlockedSlots);
  const [blockedSlotModalDate, setBlockedSlotModalDate] = useState<string | null>(null);
  const [selectedTourId, setSelectedTourId] = useState<string | null>(null);
  const [selectedBlockedSlot, setSelectedBlockedSlot] = useState<{ slot: BlockedSlot; anchorRect: DOMRect } | null>(null);
  const weekDates = getWeekDates(weekOffset);
  const activeDates = view === "day" ? [getDayDate(dayOffset)] : weekDates;
  const monthDate = getMonthDate(monthOffset);
  const yearValue = getYearValue(yearOffset);

  const appointmentEvents: CalendarEvent[] = appointments
    .filter((appointment) => appointment.status !== "cancelled")
    .map((appointment) => ({ appointment, day: activeDates.findIndex((date) => dateId(date) === appointment.date) }))
    .filter(({ day }) => day >= 0)
    .map(({ appointment, day }) => ({
      id: appointment.id,
      appointmentId: appointment.id,
      day,
      start: appointment.start,
      duration: appointment.duration,
      kind: appointment.status === "pending" ? "pending" : appointment.mode === "cabinet" ? "cabinet" : "domicile",
      animal: appointment.animalName,
      client: appointment.clientName,
      location: appointment.mode === "cabinet" ? "Cabinet" : `Domicile · ${appointment.location}`,
    }));
  // Indépendant de activeDates/view : une demande en attente doit rester
  // visible même quand la période actuellement affichée dans le planning ne
  // la contient pas (AUDIT_COMPLET.md P1-9 — corrige le fait que le panneau
  // se limitait auparavant à la période affichée).
  const pendingRequests: PendingRequest[] = appointments
    .filter((appointment) => appointment.status === "pending")
    .map((appointment) => ({
      id: appointment.id,
      appointmentId: appointment.id,
      date: appointment.date,
      start: appointment.start,
      animal: appointment.animalName,
      client: appointment.clientName,
      location: appointment.mode === "cabinet" ? "Cabinet" : `Domicile · ${appointment.location}`,
    }))
    .sort((a, b) => `${a.date} ${a.start}`.localeCompare(`${b.date} ${b.start}`));

  function matchesFilter(kind: CalendarEvent["kind"]) {
    return filter === "all" || filter === kind;
  }
  const filteredAppointmentEvents = appointmentEvents.filter((event) => matchesFilter(event.kind));

  const activeTours = tours.filter((tour) => tour.status === "Active");
  const tourEvents: CalendarEvent[] = activeDates.flatMap((date, day) => {
    const id = dateId(date);
    const weekday = weekdayLabelFor(date);
    return activeTours
      .filter((tour) => tourRunsOnDate(tour, id, weekday))
      .map((tour) => ({
        id: `tour-${tour.id}-${id}`,
        tourId: tour.id,
        day,
        start: tour.startTime,
        duration: Math.max(minutesBetween(tour.startTime, tour.endTime), 30),
        kind: "tournee" as const,
        title: tour.name,
        location: `${tour.appointmentCount} rendez-vous`,
      }));
  });
  const filteredTourEvents = tourEvents.filter((event) => matchesFilter(event.kind));

  const blockedEvents: CalendarEvent[] = activeDates.flatMap((date, day) => {
    const id = dateId(date);
    return blockedSlots
      .filter((slot) => slot.date === id)
      .map((slot) => ({
        id: `blocked-${slot.id}`,
        blockedSlotId: slot.id,
        day,
        start: slot.startTime,
        duration: Math.max(minutesBetween(slot.startTime, slot.endTime), 15),
        kind: "unavailable" as const,
        title: slot.reason || "Indisponible",
        location: "Créneau bloqué",
      }));
  });

  // Jour proposé par défaut pour "Nouveau rendez-vous"/"Bloquer un créneau",
  // selon la vue active : le jour affiché en Jour, le lundi de la semaine
  // affichée en Semaine, le jour sélectionné (sinon le 1er) en Mois,
  // aujourd'hui si l'année affichée est l'année courante sinon le 1er
  // janvier en Année.
  function smartDefaultDateId(): string {
    if (view === "day" || view === "week") return dateId(activeDates[0]);
    if (view === "month") return dateId(selectedDay ?? monthDate);
    const today = new Date();
    return yearValue === today.getFullYear() ? dateId(today) : dateId(new Date(yearValue, 0, 1, 12));
  }

  function openBlockSlotModal() {
    setBlockedSlotModalDate(smartDefaultDateId());
  }

  async function saveBlockedSlot(input: Parameters<typeof createBlockedSlotAction>[0]) {
    const result = await createBlockedSlotAction(input);
    if (!result.ok) return { ok: false, error: result.error };
    setBlockedSlots((current) => [...current, result.slot]);
    notify.success(`Créneau bloqué le ${formatDayLabel(new Date(`${result.slot.date}T12:00:00`)).toLocaleLowerCase("fr-FR")} de ${result.slot.startTime} à ${result.slot.endTime}.`);
    return { ok: true };
  }

  async function unblockSlot(id: string) {
    const result = await deleteBlockedSlotAction(id);
    if (!result.ok) return { ok: false, error: result.error };
    setBlockedSlots((current) => current.filter((slot) => slot.id !== id));
    notify.success("Le créneau a été débloqué.");
    return { ok: true };
  }

  function handleSelectTour(tourId: string) {
    setSelectedTourId(tourId);
  }

  async function deleteTour(tourId: string, tourName: string) {
    const result = await deleteTourAction(tourId);
    if (!result.ok) {
      notify.error(result.error);
      return;
    }
    setSelectedTourId(null);
    notify.success(`${tourName} a été supprimée.`);
    router.refresh();
  }

  function handleSelectBlockedSlot(id: string, anchorRect: DOMRect) {
    const slot = blockedSlots.find((item) => item.id === id);
    if (slot) setSelectedBlockedSlot({ slot, anchorRect });
  }

  function goToPrevious() {
    if (view === "day") setDayOffset((current) => current - 1);
    else if (view === "week") setWeekOffset((current) => current - 1);
    else if (view === "month") { setMonthOffset((current) => current - 1); setSelectedDay(null); }
    else setYearOffset((current) => current - 1);
  }

  function goToNext() {
    if (view === "day") setDayOffset((current) => current + 1);
    else if (view === "week") setWeekOffset((current) => current + 1);
    else if (view === "month") { setMonthOffset((current) => current + 1); setSelectedDay(null); }
    else setYearOffset((current) => current + 1);
  }

  function goToToday() {
    if (view === "day") setDayOffset(0);
    else if (view === "week") setWeekOffset(0);
    else if (view === "month") { setMonthOffset(0); setSelectedDay(null); }
    else setYearOffset(0);
  }

  function handleViewChange(nextView: AgendaViewMode) {
    setView(nextView);
    setSelectedDay(null);
  }

  function jumpToDay(date: Date) {
    const diffDays = Math.round((date.getTime() - getDayDate(0).getTime()) / DAY_IN_MS);
    setDayOffset(diffDays);
    setView("day");
  }

  function jumpToMonth(monthIndex: number) {
    setMonthOffset(monthOffsetFor(yearValue, monthIndex));
    setSelectedDay(null);
    setView("month");
  }

  async function handlePendingAction(action: string, event: CalendarEvent | PendingRequest) {
    if (!event.appointmentId) return;
    if (action === "Décalage demandé") {
      openManager(event.appointmentId);
      notify.info(`Modifiez la date ou l’heure du rendez-vous de ${event.animal ?? "l’animal"}.`);
      return;
    }
    const result = await updateAppointmentStatus(event.appointmentId, action === "Accepté" ? "confirmed" : "cancelled");
    if (!result.ok) {
      notify.error(result.error ?? "Une erreur est survenue.");
      return;
    }
    // Pas de toast de succès ici : le statut change visiblement dans la
    // liste des demandes en attente (la carte en disparaît), un toast
    // ferait doublon avec ce qui est déjà visible à l'écran.
  }

  // Extrait en variable (plutôt que rendu directement dans le JSX ci-dessous)
  // car sa position change selon la vue : juste au-dessus du planning en
  // Jour/Semaine (les demandes en attente passent avant), toujours en tête
  // en Mois/Année.
  const toolbarCard = (
      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={goToPrevious}
              aria-label={navLabel(view, "précédent")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e5e2] bg-white text-animeo-dark transition hover:border-animeo hover:text-animeo"
            >
              <Icon name="arrow" className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={goToNext}
              aria-label={navLabel(view, "suivant")}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e5e2] bg-white text-animeo-dark transition hover:border-animeo hover:text-animeo"
            >
              <Icon name="arrow" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={goToToday}
              className="rounded-xl border border-[#d9e5e2] bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo"
            >
              Aujourd’hui
            </button>
            <h2 className="ml-1 text-lg font-extrabold capitalize text-animeo-dark sm:text-xl">
              {view === "day" ? formatDayLabel(activeDates[0])
                : view === "week" ? formatWeekLabel(weekDates)
                  : view === "month" ? formatMonthLabel(monthDate)
                    : yearValue}
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <AgendaViewSwitcher value={view} onChange={handleViewChange} />

            <button
              type="button"
              onClick={openBlockSlotModal}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-animeo-dark px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <LockIcon />
              Bloquer un créneau
            </button>
            <button
              type="button"
              onClick={() => openNewAppointment(smartDefaultDateId())}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
            >
              <span aria-hidden="true" className="text-xl leading-none">+</span>
              Nouveau rendez-vous
            </button>
          </div>
        </div>

        {view !== "year" ? (
          <div className="mt-4">
            <AgendaFilterBar value={filter} onChange={setFilter} />
          </div>
        ) : null}

        {view === "day" || view === "week" ? (
          <div className="mt-4 flex items-start gap-3 rounded-2xl bg-animeo-soft px-4 py-3 text-sm text-animeo-dark">
            <Icon name="calendar" className="mt-0.5 h-5 w-5 shrink-0 text-animeo" />
            <p>
              <strong>Agenda unique :</strong> Cabinet et Domicile sont deux modes de réservation.
              Un créneau occupé dans l’un est automatiquement indisponible dans l’autre.
            </p>
          </div>
        ) : null}

      </Card>
  );

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Votre planning unique pour les rendez-vous au cabinet et à domicile."
      />

      {view === "day" || view === "week" ? (
        <>
          <PendingRequestsPanel requests={pendingRequests} onAction={handlePendingAction} />

          {toolbarCard}

          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
            <WeekPlanner
              dates={activeDates}
              clients={clients}
              availability={availability}
              appointmentEvents={filteredAppointmentEvents}
              tourEvents={filteredTourEvents}
              blockedEvents={blockedEvents}
              onPendingAction={handlePendingAction}
              onSelectTour={handleSelectTour}
              onSelectBlockedSlot={handleSelectBlockedSlot}
            />
            <AgendaSidePanel weekDates={weekDates} tours={tours} tourAppointments={tourAppointments} onSelectDate={jumpToDay} />
          </div>
        </>
      ) : view === "month" ? (
        <>
          <PendingRequestsPanel requests={pendingRequests} onAction={handlePendingAction} />

          {toolbarCard}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
          <Card className="overflow-hidden p-4 sm:p-5">
            <div className="mb-3">
              <h2 className="font-extrabold text-animeo-dark">Planning du mois</h2>
              <p className="mt-0.5 text-xs text-animeo-muted">Cliquez sur un jour pour afficher le détail des rendez-vous.</p>
            </div>
            <div className="overflow-x-auto">
              <div className="min-w-[720px]">
                <MonthCalendarView
                  monthDate={monthDate}
                  appointments={appointments}
                  tours={tours}
                  availability={availability}
                  filter={filter}
                  selectedDay={selectedDay}
                  onSelectDay={setSelectedDay}
                />
              </div>
            </div>
          </Card>

          {selectedDay ? (
            <div className="xl:sticky xl:top-6">
              <DayDetailPanel date={selectedDay} appointments={appointments} tours={tours} availability={availability} onClose={() => setSelectedDay(null)} onViewDay={() => jumpToDay(selectedDay)} />
            </div>
          ) : (
            <Card className="p-5 text-sm font-bold text-animeo-muted xl:sticky xl:top-6">
              Sélectionnez un jour dans le calendrier pour voir le détail des rendez-vous.
            </Card>
          )}
          </div>
        </>
      ) : (
        <>
          <PendingRequestsPanel requests={pendingRequests} onAction={handlePendingAction} />

          {toolbarCard}
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
          <div className="flex flex-col gap-4">
            <YearStatsRibbon year={yearValue} appointments={appointments} tours={tours} />
            <Card className="p-4 sm:p-5">
              <YearCalendarView year={yearValue} appointments={appointments} tours={tours} availability={availability} onSelectMonth={jumpToMonth} />
            </Card>
          </div>
          <div className="xl:sticky xl:top-6">
            <YearSidePanel year={yearValue} appointments={appointments} tours={tours} />
          </div>
          </div>
        </>
      )}

      {blockedSlotModalDate ? (
        <BlockedSlotModal
          initialDate={blockedSlotModalDate}
          onClose={() => setBlockedSlotModalDate(null)}
          onSave={saveBlockedSlot}
        />
      ) : null}

      {selectedTourId ? (() => {
        const tour = tours.find((item) => item.id === selectedTourId);
        if (!tour) return null;
        return (
          <TourDetailModal
            tour={tour}
            zone={zones.find((zone) => zone.id === tour.zoneId)}
            appointments={tourAppointments[tour.id] ?? []}
            cabinetCoordinates={cabinetCoordinates}
            onClose={() => setSelectedTourId(null)}
            onDelete={() => deleteTour(tour.id, tour.name)}
          />
        );
      })() : null}

      {selectedBlockedSlot ? (
        <BlockedSlotPopover
          slot={selectedBlockedSlot.slot}
          anchorRect={selectedBlockedSlot.anchorRect}
          onDelete={unblockSlot}
          onClose={() => setSelectedBlockedSlot(null)}
        />
      ) : null}
    </>
  );
}

function navLabel(view: AgendaViewMode, direction: "précédent" | "suivant") {
  const unit = view === "day" ? "le jour" : view === "week" ? "la semaine" : view === "month" ? "le mois" : "l’année";
  const suffix = direction === "précédent" ? (view === "day" || view === "month" ? "précédent" : "précédente") : "suivant" + (view === "week" ? "e" : "");
  return `Afficher ${unit} ${suffix}`;
}

function PendingRequestsPanel({ requests, onAction }: {
  requests: PendingRequest[];
  onAction: (action: string, event: PendingRequest) => void;
}) {
  if (requests.length === 0) return null;

  const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });

  return (
    <Card className="mb-6 p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-black text-animeo-dark">Demandes de rendez-vous</h2>
            <span className="rounded-full bg-[#fff1d5] px-2.5 py-1 text-xs font-black text-[#986216]">{requests.length} en attente</span>
          </div>
          <p className="mt-1 text-sm text-animeo-muted">Acceptez, décalez ou refusez les nouvelles demandes reçues.</p>
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-2">
        {requests.map((request) => (
          <article key={request.id} className="rounded-2xl border border-[#f0d8a5] bg-[#fffaf0] p-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-animeo-accent px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#62420e]">En attente</span>
                  <span className="text-xs font-extrabold capitalize text-animeo-muted">{dateFormatter.format(new Date(`${request.date}T12:00:00`))} · {request.start}</span>
                </div>
                <h3 className="mt-2 text-lg font-black text-animeo-dark">{request.animal}</h3>
                <p className="text-sm font-bold text-animeo-muted">{request.client}</p>
                <p className="mt-1 text-xs text-animeo-muted">{request.location}</p>
              </div>
              <div className="grid shrink-0 grid-cols-3 gap-2 sm:flex">
                <button type="button" onClick={() => onAction("Accepté", request)} className="rounded-xl bg-animeo px-3 py-2.5 text-xs font-extrabold text-white transition hover:bg-[#459e90]">Accepter</button>
                <button type="button" onClick={() => onAction("Décalage demandé", request)} className="rounded-xl border border-[#d7e4e1] bg-white px-3 py-2.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft">Décaler</button>
                <button type="button" onClick={() => onAction("Refusé", request)} className="rounded-xl bg-[#fff0eb] px-3 py-2.5 text-xs font-extrabold text-[#a9573b] transition hover:bg-[#ffe5dc]">Refuser</button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function LockIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
    </svg>
  );
}
