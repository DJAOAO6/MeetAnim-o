"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { relativeDayLabel } from "@/components/dashboard/dashboard-date";
import type { Reminder } from "@/data/reminders";

export function DashboardRemindersCard({ reminders }: { reminders: Reminder[] }) {
  const dueReminders = useMemo(
    () => reminders.filter((reminder) => reminder.status === "À relancer").sort((first, second) => first.dueDate.localeCompare(second.dueDate)),
    [reminders],
  );
  const visible = dueReminders.slice(0, 4);

  return (
    <Card className="p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#fff4dd] text-[#b7791f]"><Icon name="bell" className="h-5 w-5" /></span>
          <h2 className="font-black text-animeo-dark">Rappels à envoyer</h2>
        </div>
        <span className="rounded-full bg-[#fff4dd] px-2.5 py-1 text-xs font-black text-[#946116]">{dueReminders.length}</span>
      </div>

      {visible.length > 0 ? (
        <ul className="space-y-1">
          {visible.map((reminder) => (
            <li key={reminder.id}>
              <Link href="/dashboard/rappels" className="flex items-center gap-3 rounded-2xl px-2 py-2.5 transition hover:bg-animeo-bg">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark"><Icon name="paw" className="h-4.5 w-4.5" /></span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-extrabold text-animeo-dark">{reminder.animalName}</span>
                  <span className="block truncate text-xs text-animeo-muted">{reminder.clientName}</span>
                </span>
                <span className="shrink-0 text-right">
                  <span className="block text-xs font-bold text-animeo-muted">{relativeDayLabel(reminder.dueDate)}</span>
                </span>
                <MailIcon />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-animeo-bg px-4 py-6 text-center text-sm font-bold text-animeo-muted">Aucun rappel à envoyer pour le moment.</p>
      )}

      <Link href="/dashboard/rappels" className="mt-4 flex w-full items-center justify-center rounded-2xl bg-[#fff4dd] px-4 py-3 text-sm font-extrabold text-[#9a671c] transition hover:bg-[#ffe9bd]">
        Voir tous les rappels
      </Link>
    </Card>
  );
}

function MailIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4 shrink-0 text-animeo-muted">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}
