"use client";

import { useState } from "react";
import { AgendaSidePanel } from "@/components/agenda/agenda-side-panel";
import { WeekPlanner } from "@/components/agenda/week-planner";
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
  const weekDates = getWeekDates(weekOffset);

  function showFeedback(message: string) {
    setFeedback(`${message} — simulation locale, aucune donnée n’a été enregistrée.`);
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
              onClick={() => showFeedback("Le blocage d’un créneau sera ajouté ici")}
              className="inline-flex items-center justify-center gap-2 rounded-xl border border-animeo-dark px-4 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <LockIcon />
              Bloquer un créneau
            </button>
            <button
              type="button"
              onClick={() => showFeedback("La création d’un rendez-vous sera ajoutée ici")}
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

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_310px]">
        <WeekPlanner
          dates={weekDates}
          showEvents={weekOffset === 0}
          onPendingAction={(action, animal) => showFeedback(`${action} pour le rendez-vous de ${animal}`)}
        />
        <AgendaSidePanel weekDates={weekDates} />
      </div>
    </>
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
