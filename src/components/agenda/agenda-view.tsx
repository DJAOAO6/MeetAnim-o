"use client";

import { useState } from "react";
import { AgendaSidePanel } from "@/components/agenda/agenda-side-panel";
import { WeekPlanner, pendingAppointmentRequests, type CalendarEvent } from "@/components/agenda/week-planner";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";

const REFERENCE_MONDAY = new Date(2026, 7, 24, 12);
const DAY_IN_MS = 24 * 60 * 60 * 1000;

function getWeekDates(offset: number) {
  return Array.from({ length: 7 }, (_, dayIndex) =>
    new Date(REFERENCE_MONDAY.getTime() + (offset * 7 + dayIndex) * DAY_IN_MS),
  );
}

function formatWeekLabel(dates: Date[]) {
  const first = dates[0];
  const last = dates[6];
  const monthFormatter = new Intl.DateTimeFormat("fr-FR", { month: "long" });

  if (first.getMonth() === last.getMonth()) {
    return `${first.getDate()} – ${last.getDate()} ${monthFormatter.format(last)} ${last.getFullYear()}`;
  }

  return `${first.getDate()} ${monthFormatter.format(first)} – ${last.getDate()} ${monthFormatter.format(last)} ${last.getFullYear()}`;
}

export function AgendaView() {
  const [weekOffset, setWeekOffset] = useState(0);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [localEvents, setLocalEvents] = useState<CalendarEvent[]>([]);
  const [pendingRequests, setPendingRequests] = useState<CalendarEvent[]>(() => [...pendingAppointmentRequests]);
  const [handledPendingIds, setHandledPendingIds] = useState<number[]>([]);
  const weekDates = getWeekDates(weekOffset);

  function showFeedback(message: string) {
    setFeedback(`${message} — simulation locale, aucune donnée n’a été enregistrée.`);
  }

  function simulateAppointment() {
    const request: CalendarEvent = { id: 1001, day: 2, start: "17:00", duration: 60, kind: "pending", animal: "Nouvel animal", client: "Demande locale", location: "Cabinet" };
    setLocalEvents((current) => current.some((event) => event.id === 1001) ? current : [
      ...current,
      request,
    ]);
    setPendingRequests((current) => current.some((event) => event.id === request.id) ? current : [...current, request]);
    setFeedback("Un rendez-vous fictif en attente a été ajouté mercredi à 17:00.");
  }

  function simulateBlockedSlot() {
    setLocalEvents((current) => current.some((event) => event.id === 1002) ? current : [
      ...current,
      { id: 1002, day: 4, start: "16:00", duration: 60, kind: "unavailable", title: "Indisponible", location: "Créneau bloqué localement" },
    ]);
    setFeedback("Le créneau du vendredi à 16:00 a été bloqué localement dans l’agenda unique.");
  }

  function handlePendingAction(action: string, event: CalendarEvent) {
    setPendingRequests((current) => current.filter((request) => request.id !== event.id));
    setHandledPendingIds((current) => current.includes(event.id) ? current : [...current, event.id]);
    showFeedback(`${action} pour le rendez-vous de ${event.animal ?? "l’animal"}`);
  }

  return (
    <>
      <PageHeader
        title="Agenda"
        description="Votre planning unique pour les rendez-vous au cabinet et à domicile."
      />

      <Card className="mb-6 p-4 sm:p-5">
        <div className="flex flex-col gap-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setWeekOffset((current) => current - 1)}
              aria-label="Afficher la semaine précédente"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e5e2] bg-white text-animeo-dark transition hover:border-animeo hover:text-animeo"
            >
              <Icon name="arrow" className="h-4 w-4 rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset((current) => current + 1)}
              aria-label="Afficher la semaine suivante"
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#d9e5e2] bg-white text-animeo-dark transition hover:border-animeo hover:text-animeo"
            >
              <Icon name="arrow" className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setWeekOffset(0)}
              className="rounded-xl border border-[#d9e5e2] bg-white px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:border-animeo"
            >
              Aujourd’hui
            </button>
            <h2 className="ml-1 text-lg font-extrabold capitalize text-animeo-dark sm:text-xl">
              {formatWeekLabel(weekDates)}
            </h2>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="inline-flex w-fit rounded-xl bg-animeo-soft p-1" aria-label="Choix de la vue">
              {[
                { label: "Jour", active: false },
                { label: "Semaine", active: true },
                { label: "Mois", active: false },
              ].map((view) => (
                <button
                  key={view.label}
                  type="button"
                  aria-pressed={view.active}
                  disabled={!view.active}
                  className={`rounded-lg px-3.5 py-2 text-sm font-extrabold transition ${
                    view.active
                      ? "bg-white text-animeo-dark shadow-sm"
                      : "cursor-not-allowed text-animeo-muted opacity-65"
                  }`}
                  title={view.active ? "Vue active" : "Cette vue sera construite plus tard"}
                >
                  {view.label}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={simulateBlockedSlot}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-animeo-dark px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <LockIcon />
              Bloquer un créneau
            </button>
            <button
              type="button"
              onClick={simulateAppointment}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-animeo px-4 py-2.5 text-sm font-extrabold text-white shadow-[0_8px_20px_rgba(79,175,159,0.2)] transition hover:-translate-y-0.5 hover:bg-[#459e90]"
            >
              <span aria-hidden="true" className="text-xl leading-none">+</span>
              Nouveau rendez-vous
            </button>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-3 rounded-2xl bg-animeo-soft px-4 py-3 text-sm text-animeo-dark">
          <Icon name="calendar" className="mt-0.5 h-5 w-5 shrink-0 text-animeo" />
          <p>
            <strong>Agenda unique :</strong> Cabinet et Domicile sont deux modes de réservation.
            Un créneau occupé dans l’un est automatiquement indisponible dans l’autre.
          </p>
        </div>

        {feedback ? (
          <div role="status" className="mt-3 flex items-center justify-between gap-4 rounded-xl border border-[#f4d99e] bg-[#fff9ec] px-4 py-2.5 text-sm font-bold text-[#8c6118]">
            <span>{feedback}</span>
            <button type="button" onClick={() => setFeedback(null)} aria-label="Fermer le message" className="text-lg leading-none">×</button>
          </div>
        ) : null}
      </Card>

      <PendingRequestsPanel requests={pendingRequests} weekDates={weekDates} onAction={handlePendingAction} />

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <WeekPlanner
          dates={weekDates}
          showEvents={weekOffset === 0}
          localEvents={localEvents}
          handledPendingIds={handledPendingIds}
          onPendingAction={handlePendingAction}
        />
        <AgendaSidePanel weekDates={weekDates} />
      </div>
    </>
  );
}

function PendingRequestsPanel({ requests, weekDates, onAction }: {
  requests: CalendarEvent[];
  weekDates: Date[];
  onAction: (action: string, event: CalendarEvent) => void;
}) {
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

      {requests.length > 0 ? (
        <div className="grid gap-3 xl:grid-cols-2">
          {requests.map((request) => (
            <article key={request.id} className="rounded-2xl border border-[#f0d8a5] bg-[#fffaf0] p-4">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-animeo-accent px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-[#62420e]">En attente</span>
                    <span className="text-xs font-extrabold capitalize text-animeo-muted">{dateFormatter.format(weekDates[request.day])} · {request.start}</span>
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
      ) : (
        <div className="rounded-2xl bg-animeo-soft px-4 py-5 text-sm font-bold text-animeo-dark">✓ Toutes les demandes ont été traitées.</div>
      )}
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
