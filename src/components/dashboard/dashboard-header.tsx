"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Icon } from "@/components/ui/icon";
import { relativeDayLabel } from "@/components/dashboard/dashboard-date";
import { initialsFor } from "@/lib/format";
import type { Reminder } from "@/data/reminders";

export function DashboardHeader({ reminders }: { reminders: Reminder[] }) {
  const user = useCurrentUser();
  const router = useRouter();
  const { appointments, openManager } = useAppointments();
  const [query, setQuery] = useState("");
  const [notifOpen, setNotifOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  const dueReminders = useMemo(
    () => reminders.filter((reminder) => reminder.status === "À relancer").sort((first, second) => first.dueDate.localeCompare(second.dueDate)),
    [reminders],
  );
  const pendingAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "pending")
        .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`)),
    [appointments],
  );
  const notificationCount = dueReminders.length + pendingAppointments.length;

  useEffect(() => {
    if (!notifOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(event.target as Node)) setNotifOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setNotifOpen(false);
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [notifOpen]);

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/clients?q=${encodeURIComponent(trimmed)}` : "/dashboard/clients");
  }

  return (
    <div className="mb-6 flex flex-col gap-5">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-[28px] font-black leading-tight text-animeo-dark sm:text-[32px]">
            Bonjour {user?.firstName ?? ""} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-1.5 text-sm text-animeo-muted sm:text-base">Voici votre journée en un coup d’œil.</p>
        </div>

        <div className="flex items-center gap-3">
          <form onSubmit={submitSearch} className="relative hidden sm:block">
            <SearchIcon />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un client, un animal…"
              className="h-12 w-64 rounded-2xl border border-[#e1eae8] bg-white pl-11 pr-4 text-sm font-semibold text-animeo-dark shadow-[0_4px_16px_rgba(21,63,71,0.04)] outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:w-72 lg:w-72"
            />
          </form>

          <div ref={notifRef} className="relative">
            <button
              type="button"
              onClick={() => setNotifOpen((current) => !current)}
              aria-label={`Notifications${notificationCount > 0 ? ` — ${notificationCount} importantes` : ""}`}
              aria-haspopup="true"
              aria-expanded={notifOpen}
              className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#e1eae8] bg-white text-animeo-dark shadow-[0_4px_16px_rgba(21,63,71,0.04)] transition hover:border-animeo hover:text-animeo"
            >
              <Icon name="bell" className="h-5 w-5" />
              {notificationCount > 0 ? (
                <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C1533C] px-1 text-[10px] font-black text-white">
                  {notificationCount}
                </span>
              ) : null}
            </button>

            <div
              role="menu"
              aria-label="Notifications importantes"
              className={`absolute right-0 top-[calc(100%+10px)] z-50 w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-[#e1eae8] bg-white p-2 shadow-[0_20px_45px_rgba(21,63,71,0.16)] transition duration-200 ease-out ${
                notifOpen ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none -translate-y-2 scale-95 opacity-0"
              }`}
            >
              <div className="max-h-[70vh] overflow-y-auto">
                {notificationCount === 0 ? (
                  <p className="px-3 py-8 text-center text-sm font-bold text-animeo-muted">Aucune notification importante pour le moment.</p>
                ) : (
                  <>
                    {pendingAppointments.length > 0 ? (
                      <div className="mb-1">
                        <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Demandes de rendez-vous</p>
                        {pendingAppointments.slice(0, 4).map((appointment) => (
                          <button
                            key={appointment.id}
                            type="button"
                            onClick={() => {
                              setNotifOpen(false);
                              openManager(appointment.id);
                            }}
                            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-animeo-bg"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff4dd] text-[#b7791f]">
                              <Icon name="agenda" className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-animeo-dark">{appointment.animalName}</span>
                              <span className="block truncate text-xs text-animeo-muted">{appointment.clientName}</span>
                            </span>
                            <span className="shrink-0 text-xs font-bold text-animeo-muted">{appointment.start}</span>
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {dueReminders.length > 0 ? (
                      <div>
                        <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Rappels à relancer</p>
                        {dueReminders.slice(0, 4).map((reminder) => (
                          <Link
                            key={reminder.id}
                            href="/dashboard/rappels"
                            onClick={() => setNotifOpen(false)}
                            className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-animeo-bg"
                          >
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-soft text-animeo-dark">
                              <Icon name="paw" className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-animeo-dark">{reminder.animalName}</span>
                              <span className="block truncate text-xs text-animeo-muted">{reminder.clientName}</span>
                            </span>
                            <span className="shrink-0 text-xs font-bold text-animeo-muted">{relativeDayLabel(reminder.dueDate)}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </>
                )}
              </div>

              <Link
                href="/dashboard/rappels"
                onClick={() => setNotifOpen(false)}
                className="mt-1 flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-bg"
              >
                Voir tous les rappels
              </Link>
            </div>
          </div>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-sm font-black text-animeo-dark" title={user ? `${user.firstName} ${user.lastName}` : undefined}>
            {user ? initialsFor(user.firstName, user.lastName) : ""}
          </div>
        </div>
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 h-4.5 w-4.5 -translate-y-1/2 text-animeo-muted">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </svg>
  );
}
