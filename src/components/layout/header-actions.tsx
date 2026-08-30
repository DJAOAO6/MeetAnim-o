"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { LiveClock } from "@/components/dashboard/live-clock";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";
import { logout } from "@/lib/auth/actions";
import { initialsFor } from "@/lib/format";

const roleLabels: Record<string, string> = {
  ADMIN: "Administrateur",
  PRACTITIONER: "Praticien",
  SECRETARY: "Secrétariat",
};

/**
 * Horloge, recherche, cloche et profil (avatar + nom/rôle + déconnexion) :
 * le bloc d'actions partagé, embarqué dans l'en-tête de chaque page
 * (PageHeader, DashboardHeader) plutôt que rendu séparément au-dessus depuis
 * le layout — pour que titre de page et actions tiennent sur une seule
 * rangée au lieu de deux rangées décalées verticalement. Masqué sur mobile :
 * la cloche y est déplacée dans le bandeau fixe de la sidebar pour ne pas
 * empiler deux barres d'en-tête sous les 768px.
 */
export function HeaderActions() {
  const user = useCurrentUser();
  const router = useRouter();
  const [query, setQuery] = useState("");

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    router.push(trimmed ? `/dashboard/clients?q=${encodeURIComponent(trimmed)}` : "/dashboard/clients");
  }

  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex">
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

      {user ? (
        <div className="flex items-center gap-3 rounded-[18px] border border-[#dfe9e6] bg-white px-3 py-2 shadow-[0_6px_20px_rgba(24,59,69,0.04)]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-animeo-soft text-sm font-extrabold text-animeo-dark">{initialsFor(user.firstName, user.lastName)}</div>
          <div className="hidden min-w-0 pr-2 lg:block">
            <p className="truncate text-sm font-bold text-animeo-dark">{user.firstName} {user.lastName}</p>
            <p className="truncate text-xs text-animeo-muted">{roleLabels[user.role] ?? user.role}</p>
          </div>
          <form action={logout} className="hidden border-l border-[#e5eeeb] pl-3 lg:block">
            <button type="submit" title="Se déconnecter" aria-label="Se déconnecter" className="flex h-8 w-8 items-center justify-center rounded-[10px] text-animeo-muted transition hover:bg-animeo-bg hover:text-animeo-error">
              <LogoutIcon />
            </button>
          </form>
        </div>
      ) : null}
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

function LogoutIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5">
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}
