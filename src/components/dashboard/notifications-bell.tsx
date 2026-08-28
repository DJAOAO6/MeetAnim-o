"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { relativeDayLabel } from "@/components/dashboard/dashboard-date";
import { useReminders } from "@/components/dashboard/reminders-context";
import { Icon } from "@/components/ui/icon";
import { formatNotificationBadge } from "@/lib/format";

type NotificationsBellProps = {
  /** "surface" : bouton blanc sur fond clair (DashboardTopBar). "onDark" : bouton translucide sur le bandeau mobile de la sidebar. */
  variant?: "surface" | "onDark";
};

export function NotificationsBell({ variant = "surface" }: NotificationsBellProps) {
  const { reminders } = useReminders();
  const { appointments, openManager } = useAppointments();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

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
  // Aucun troncage ici : la liste rendue ci-dessous est exhaustive (panneau
  // défilant), donc ce total correspond toujours à ce qui est réellement
  // atteignable — plus de badge qui ment sur un .slice(0, 4) local.
  const notificationCount = dueReminders.length + pendingAppointments.length;
  const badgeLabel = formatNotificationBadge(notificationCount);

  // Ferme le panneau à chaque changement de route, ajusté pendant le rendu
  // plutôt que dans un effet (pas de setState synchrone dans un effet).
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    if (open) setOpen(false);
  }

  useEffect(() => {
    if (!open) return;

    // Focus géré à l'ouverture : on l'amène dans le panneau plutôt que de le
    // laisser sur le déclencheur, pour que la navigation clavier (Tab)
    // atteigne directement son contenu.
    panelRef.current?.focus();

    function handlePointerDown(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  function close() {
    setOpen(false);
  }

  const triggerClassName = variant === "onDark"
    ? "relative flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white/10 text-white transition hover:bg-white/20"
    : "relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#e1eae8] bg-white text-animeo-dark shadow-[0_4px_16px_rgba(21,63,71,0.04)] transition hover:border-animeo hover:text-animeo";

  return (
    <div ref={containerRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={`Notifications${notificationCount > 0 ? ` — ${notificationCount} importantes` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
      >
        <Icon name="bell" className="h-5 w-5" />
        {notificationCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C1533C] px-1 text-xs font-black leading-none text-white ring-2 ring-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {/* Discrète, hors flux visuel : signale le changement de compteur aux technologies d'assistance sans dépendre du focus. */}
      <span role="status" aria-live="polite" className="sr-only">
        {notificationCount > 0 ? `${notificationCount} notification${notificationCount > 1 ? "s" : ""} importante${notificationCount > 1 ? "s" : ""}` : "Aucune notification importante"}
      </span>

      <div
        ref={panelRef}
        tabIndex={-1}
        aria-labelledby={titleId}
        className={`absolute right-0 top-[calc(100%+10px)] z-[1200] w-[22rem] max-w-[calc(100vw-2rem)] origin-top-right rounded-2xl border border-[#e1eae8] bg-white p-2 shadow-[0_20px_45px_rgba(21,63,71,0.16)] outline-none transition duration-200 ease-out ${
          open ? "visible translate-y-0 scale-100 opacity-100" : "invisible pointer-events-none -translate-y-2 scale-95 opacity-0"
        }`}
      >
        <p id={titleId} className="px-3 pb-1 pt-2 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Notifications</p>

        <div className="max-h-[70vh] overflow-y-auto">
          {notificationCount === 0 ? (
            <p className="px-3 py-8 text-center text-sm font-bold text-animeo-muted">Aucune notification importante pour le moment.</p>
          ) : (
            <>
              {pendingAppointments.length > 0 ? (
                <div className="mb-1">
                  <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Demandes de rendez-vous</p>
                  {pendingAppointments.map((appointment) => (
                    <button
                      key={appointment.id}
                      type="button"
                      onClick={() => {
                        close();
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
                  {dueReminders.map((reminder) => (
                    <Link key={reminder.id} href="/dashboard/rappels" onClick={close} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition hover:bg-animeo-bg">
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

        {pendingAppointments.length > 0 || dueReminders.length > 0 ? (
          <div className="mt-1 flex items-center gap-1">
            {pendingAppointments.length > 0 ? (
              <Link href="/dashboard/agenda" onClick={close} className="flex-1 flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-bg">
                Voir l’agenda
              </Link>
            ) : null}
            {dueReminders.length > 0 ? (
              <Link href="/dashboard/rappels" onClick={close} className="flex-1 flex items-center justify-center rounded-xl px-3 py-2.5 text-sm font-extrabold text-animeo transition hover:bg-animeo-bg">
                Voir tous les rappels
              </Link>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
