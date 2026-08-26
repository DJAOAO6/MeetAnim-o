"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { Icon } from "@/components/ui/icon";
import { initialsFor } from "@/lib/format";
import { NewAppointmentButton } from "@/components/appointments/dashboard-agenda-overview";

export function DashboardHeader({ dueReminders }: { dueReminders: number }) {
  const user = useCurrentUser();
  const router = useRouter();
  const [query, setQuery] = useState("");

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

          <Link
            href="/dashboard/rappels"
            aria-label={`Rappels clients${dueReminders > 0 ? ` — ${dueReminders} à envoyer` : ""}`}
            className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-[#e1eae8] bg-white text-animeo-dark shadow-[0_4px_16px_rgba(21,63,71,0.04)] transition hover:border-animeo hover:text-animeo"
          >
            <Icon name="bell" className="h-5 w-5" />
            {dueReminders > 0 ? (
              <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#C1533C] px-1 text-[10px] font-black text-white">{dueReminders}</span>
            ) : null}
          </Link>

          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-sm font-black text-animeo-dark" title={user ? `${user.firstName} ${user.lastName}` : undefined}>
            {user ? initialsFor(user.firstName, user.lastName) : ""}
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <NewAppointmentButton />
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
