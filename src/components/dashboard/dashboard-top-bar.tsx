"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LiveClock } from "@/components/dashboard/live-clock";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { initialsFor } from "@/lib/format";

/**
 * PROMPT-NOTIFICATIONS.md §B2 bis : recherche + cloche + avatar, séparés du
 * message d'accueil (resté dans DashboardHeader, propre au tableau de bord).
 * Rendu une seule fois depuis le layout, donc présent sur toutes les pages
 * du dashboard. Masqué sur mobile (option 1 du document) : la cloche y est
 * déplacée dans le bandeau fixe de la sidebar pour ne pas empiler deux
 * barres d'en-tête sous les 768px.
 */
export function DashboardTopBar() {
  const user = useCurrentUser();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/clients?q=${encodeURIComponent(trimmed)}` : "/dashboard/clients");
  }

  return (
    <div className="mb-6 hidden items-center justify-end gap-3 md:flex">
      <LiveClock />

      <form onSubmit={submitSearch} role="search" className="relative hidden sm:block">
        <SearchIcon />
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Rechercher un client, un animal…"
          aria-label="Rechercher un client, un animal"
          className="h-12 w-64 rounded-2xl border border-[#e1eae8] bg-white pl-11 pr-4 text-sm font-semibold text-animeo-dark shadow-[0_4px_16px_rgba(21,63,71,0.04)] outline-none transition placeholder:text-[#9aa6aa] focus:border-animeo focus:w-72 lg:w-72"
        />
      </form>

      <NotificationsBell />

      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-animeo-soft text-sm font-black text-animeo-dark" title={user ? `${user.firstName} ${user.lastName}` : undefined}>
        {user ? initialsFor(user.firstName, user.lastName) : ""}
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
