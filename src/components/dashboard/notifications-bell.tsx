"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useAppointments } from "@/components/appointments/appointments-context";
import { relativeDayLabel } from "@/components/dashboard/dashboard-date";
import { useReminders } from "@/components/dashboard/reminders-context";
import { Icon } from "@/components/ui/icon";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import type { Appointment } from "@/data/appointments";
import { formatNotificationBadge } from "@/lib/format";
import { notify } from "@/lib/notify";

type NotificationsBellProps = {
  /** "surface" : bouton blanc sur fond clair (HeaderActions). "onDark" : bouton translucide sur le bandeau mobile de la sidebar. */
  variant?: "surface" | "onDark";
};

const HIDDEN_STORAGE_KEY = "animeo:notifications:hidden";
const READ_STORAGE_KEY = "animeo:notifications:read";

/**
 * Il n'existe pas de table Notification en base : ce panneau dérive tout en
 * direct des vraies demandes de rendez-vous en attente et des vrais rappels
 * à relancer. « Lu » et « masqué » n'ont donc pas de pendant serveur — ce
 * sont des préférences d'affichage purement locales (par appareil), qui ne
 * touchent jamais le rendez-vous ou le rappel sous-jacent : le masquer ici
 * ne le résout pas, il reste à traiter normalement depuis Agenda/Rappels.
 */
function readStoredIds(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? new Set(parsed.filter((item): item is string => typeof item === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function persistStoredIds(key: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(key, JSON.stringify([...ids]));
  } catch {
    // best-effort : une préférence d'affichage locale, jamais bloquant
  }
}

export function NotificationsBell({ variant = "surface" }: NotificationsBellProps) {
  const { reminders } = useReminders();
  const { appointments, openManager, updateAppointmentStatus } = useAppointments();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  // Démarre vide (identique au rendu serveur) puis se remplit depuis
  // localStorage une fois l'hydratation passée (useHasMounted), pour ne
  // jamais désaccorder le premier rendu client du rendu serveur — ajusté
  // pendant le rendu plutôt que dans un effet, même motif que plus haut
  // dans ce fichier (pas de setState direct dans un effet).
  const hasMounted = useHasMounted();
  const [hiddenIds, setHiddenIds] = useState<Set<string>>(new Set());
  const [readIds, setReadIds] = useState<Set<string>>(new Set());
  const [storageLoaded, setStorageLoaded] = useState(false);
  if (hasMounted && !storageLoaded) {
    setStorageLoaded(true);
    setHiddenIds(readStoredIds(HIDDEN_STORAGE_KEY));
    setReadIds(readStoredIds(READ_STORAGE_KEY));
  }

  function markRead(key: string) {
    setReadIds((current) => {
      if (current.has(key)) return current;
      const next = new Set(current);
      next.add(key);
      persistStoredIds(READ_STORAGE_KEY, next);
      return next;
    });
  }

  function hideNotification(key: string) {
    setHiddenIds((current) => {
      const next = new Set(current);
      next.add(key);
      persistStoredIds(HIDDEN_STORAGE_KEY, next);
      return next;
    });
  }

  // Valider/Refuser directement depuis la notification, sans repasser par
  // l'agenda — la demande sort naturellement de pendingAppointments une fois
  // son statut changé (le filtre status === "pending" ne la retient plus).
  async function respondToRequest(appointment: Appointment, status: "confirmed" | "cancelled") {
    markRead(`pending:${appointment.id}`);
    const result = await updateAppointmentStatus(appointment.id, status);
    if (!result.ok) {
      notify.error(result.error ?? "Une erreur est survenue.");
      return;
    }
    notify.success(status === "confirmed" ? `Rendez-vous de ${appointment.animalName} validé.` : `Demande de ${appointment.animalName} refusée.`);
  }

  const dueReminders = useMemo(
    () => reminders
      .filter((reminder) => reminder.status === "À relancer" && !hiddenIds.has(`reminder:${reminder.id}`))
      .sort((first, second) => first.dueDate.localeCompare(second.dueDate)),
    [reminders, hiddenIds],
  );
  const pendingAppointments = useMemo(
    () =>
      appointments
        .filter((appointment) => appointment.status === "pending" && !hiddenIds.has(`pending:${appointment.id}`))
        .sort((first, second) => `${first.date} ${first.start}`.localeCompare(`${second.date} ${second.start}`)),
    [appointments, hiddenIds],
  );
  // Aucun troncage ici : la liste rendue ci-dessous est exhaustive (panneau
  // défilant), donc ce total correspond toujours à ce qui est réellement
  // atteignable — plus de badge qui ment sur un .slice(0, 4) local. Le
  // compteur ne reflète que les notifications non lues (une notification
  // lue reste visible dans la liste, juste retirée du badge).
  const unreadCount = dueReminders.filter((reminder) => !readIds.has(`reminder:${reminder.id}`)).length
    + pendingAppointments.filter((appointment) => !readIds.has(`pending:${appointment.id}`)).length;
  const notificationCount = dueReminders.length + pendingAppointments.length;
  const badgeLabel = formatNotificationBadge(unreadCount);

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
        aria-label={`Notifications${unreadCount > 0 ? ` — ${unreadCount} non lues` : ""}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={triggerClassName}
      >
        <Icon name="bell" className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#C1533C] px-1 text-xs font-black leading-none text-white ring-2 ring-white">
            {badgeLabel}
          </span>
        ) : null}
      </button>

      {/* Discrète, hors flux visuel : signale le changement de compteur aux technologies d'assistance sans dépendre du focus. */}
      <span role="status" aria-live="polite" className="sr-only">
        {unreadCount > 0 ? `${unreadCount} notification${unreadCount > 1 ? "s" : ""} non lue${unreadCount > 1 ? "s" : ""}` : "Aucune notification non lue"}
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
                  {pendingAppointments.map((appointment) => {
                    const key = `pending:${appointment.id}`;
                    const unread = !readIds.has(key);
                    return (
                      <div key={appointment.id} className="group rounded-xl transition hover:bg-animeo-bg">
                        <div className="flex items-center gap-1">
                          <div className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                            {unread ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-animeo" /> : <span className="w-1.5 shrink-0" />}
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#fff4dd] text-[#b7791f]">
                              <Icon name="agenda" className="h-4 w-4" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-extrabold text-animeo-dark">{appointment.animalName}</span>
                              <span className="block truncate text-xs text-animeo-muted">{appointment.clientName}</span>
                            </span>
                            <span className="shrink-0 text-xs font-bold text-animeo-muted">{appointment.start}</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => hideNotification(key)}
                            aria-label={`Masquer la notification de ${appointment.animalName}`}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-animeo-muted transition hover:bg-white hover:text-animeo-dark mr-2"
                          >
                            ×
                          </button>
                        </div>
                        <div className="flex items-center gap-1.5 px-3 pb-2.5 pl-8">
                          <button
                            type="button"
                            onClick={() => respondToRequest(appointment, "confirmed")}
                            className="rounded-lg bg-animeo px-2.5 py-1.5 text-xs font-extrabold text-white transition hover:bg-[#459e90]"
                          >
                            Valider
                          </button>
                          <button
                            type="button"
                            onClick={() => respondToRequest(appointment, "cancelled")}
                            className="rounded-lg bg-[#fff0eb] px-2.5 py-1.5 text-xs font-extrabold text-[#a9573b] transition hover:bg-[#ffe5dc]"
                          >
                            Refuser
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              markRead(key);
                              close();
                              openManager(appointment.id);
                            }}
                            className="ml-auto rounded-lg border border-[#d7e4e1] bg-white px-2.5 py-1.5 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
                          >
                            Voir plus
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}

              {dueReminders.length > 0 ? (
                <div>
                  <p className="px-3 pb-1 pt-2 text-[11px] font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Rappels à relancer</p>
                  {dueReminders.map((reminder) => {
                    const key = `reminder:${reminder.id}`;
                    const unread = !readIds.has(key);
                    return (
                      <div key={reminder.id} className="group flex items-center gap-1 rounded-xl transition hover:bg-animeo-bg">
                        <Link href="/dashboard/rappels" onClick={() => { markRead(key); close(); }} className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
                          {unread ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-animeo" /> : <span className="w-1.5 shrink-0" />}
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-animeo-soft text-animeo-dark">
                            <Icon name="paw" className="h-4 w-4" />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-extrabold text-animeo-dark">{reminder.animalName}</span>
                            <span className="block truncate text-xs text-animeo-muted">{reminder.clientName}</span>
                          </span>
                          <span className="shrink-0 text-xs font-bold text-animeo-muted">{relativeDayLabel(reminder.dueDate)}</span>
                        </Link>
                        <button
                          type="button"
                          onClick={() => hideNotification(key)}
                          aria-label={`Masquer la notification de ${reminder.animalName}`}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-lg leading-none text-animeo-muted transition hover:bg-white hover:text-animeo-dark mr-2"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
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
