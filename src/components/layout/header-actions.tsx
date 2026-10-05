"use client";

import { LiveClock } from "@/components/dashboard/live-clock";
import { HeaderSearch } from "@/components/search/header-search";
import { NotificationsBell } from "@/components/dashboard/notifications-bell";

/**
 * Horloge, recherche et cloche : le bloc d'actions partagé, embarqué dans
 * l'en-tête de chaque page (PageHeader, DashboardHeader) plutôt que rendu
 * séparément au-dessus depuis le layout — pour que titre de page et actions
 * tiennent sur une seule rangée au lieu de deux rangées décalées
 * verticalement. Masqué sur mobile : la cloche et une loupe (recherche en
 * plein écran) sont dans le bandeau fixe de la sidebar, pour ne pas empiler
 * deux barres d'en-tête sous les 768px.
 *
 * Le profil (avatar, nom, rôle, déconnexion) vit uniquement dans la sidebar
 * (bloc en bas avec chevron) — l'ancienne carte profil dupliquée ici a été
 * retirée pour ne pas répéter la même information deux fois à l'écran.
 */
export function HeaderActions() {
  return (
    <div className="hidden shrink-0 items-center gap-3 md:flex">
      <LiveClock />

      {/* Suggestions pendant la frappe, Ctrl+K pour y venir (chantier C5). */}
      <HeaderSearch />

      <NotificationsBell />
    </div>
  );
}
