"use client";

import Image from "next/image";
import Link from "next/link";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { HeaderActions } from "@/components/layout/header-actions";
import { Icon } from "@/components/ui/icon";

/**
 * En-tête du tableau de bord : barre d'actions (horloge, recherche, cloche)
 * puis bandeau d'accueil illustré.
 *
 * Le bandeau a été resserré d'environ un tiers : il occupait le haut de
 * l'écran sans jamais rien apprendre, et repoussait sous la ligne de flottaison
 * le planning du jour, qui est la vraie raison d'ouvrir cette page.
 * L'illustration reste — c'est l'identité de 1002 Pattes — mais elle habille
 * le bandeau au lieu d'en fixer la hauteur.
 *
 * « Nouveau rendez-vous » ouvre exactement le même formulaire que le bouton
 * flottant (openNewAppointment), jamais un chemin de création parallèle.
 */
export function DashboardHeader() {
  const user = useCurrentUser();
  const { openNewAppointment } = useAppointments();

  return (
    <header className="mb-[var(--dashboard-gap)]">
      <div className="mb-[var(--dashboard-card-gap)] hidden justify-end md:flex">
        <HeaderActions />
      </div>

      <section className="relative overflow-hidden rounded-[calc(var(--theme-card-radius)+6px)] border border-animeo-border bg-[linear-gradient(115deg,var(--theme-surface)_0%,var(--theme-surface-alt)_45%,var(--theme-soft)_100%)] shadow-[0_10px_34px_rgb(var(--theme-shadow-rgb)/0.06)]">
        <div className="relative z-10 flex flex-col gap-4 p-[var(--dashboard-card-padding)] lg:max-w-[56%]">
          <div>
            <h1 className="text-2xl font-black leading-tight text-animeo-dark sm:text-[30px]">
              Bonjour {user?.firstName ?? ""} <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1 text-sm font-bold text-animeo-dark sm:text-base">Ensemble pour le bien-être animal</p>
            <p className="mt-1 text-sm text-animeo-muted">Une nouvelle journée pour prendre soin de vos compagnons à quatre pattes.</p>
          </div>

          <div className="flex flex-wrap gap-2.5">
            <button
              type="button"
              onClick={() => openNewAppointment()}
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-animeo px-4 text-sm font-extrabold text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--theme-brand)_28%,transparent)] transition hover:-translate-y-0.5"
            >
              <Icon name="calendarPlus" className="h-4.5 w-4.5" />
              Nouveau rendez-vous
            </button>
            <Link
              href="/dashboard/agenda"
              className="inline-flex min-h-11 items-center gap-2 rounded-2xl border border-animeo-border bg-animeo-surface px-4 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-soft"
            >
              <Icon name="agenda" className="h-4.5 w-4.5" />
              Voir l’agenda
            </Link>
          </div>
        </div>

        {/* Décoratif : masqué sous lg, où le bandeau passe en pleine largeur
            et où l'illustration réduirait la place du texte et des boutons. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[44%] items-end justify-end lg:flex">
          <Image src="/illustrations/animals-group.webp" alt="" width={560} height={220} priority className="h-auto max-h-full w-full max-w-[460px] object-contain object-bottom" />
        </div>
      </section>
    </header>
  );
}
