"use client";

import Image from "next/image";
import { useAppointments } from "@/components/appointments/appointments-context";
import { useCurrentUser } from "@/components/auth/current-user-provider";
import { HeaderActions } from "@/components/layout/header-actions";
import { Icon } from "@/components/ui/icon";

/**
 * En-tête du tableau de bord : barre d'actions (horloge, recherche, cloche)
 * puis bannière d'accueil illustrée. Le bouton « Nouveau rendez-vous »
 * ouvre exactement le même formulaire que le bouton flottant
 * (openNewAppointment), jamais un chemin de création parallèle.
 */
export function DashboardHeader() {
  const user = useCurrentUser();
  const { openNewAppointment } = useAppointments();

  return (
    <header className="mb-6">
      <div className="mb-5 hidden justify-end md:flex">
        <HeaderActions />
      </div>

      <section className="relative overflow-hidden rounded-[calc(var(--theme-card-radius)+6px)] border border-animeo-border bg-[linear-gradient(115deg,var(--theme-surface)_0%,var(--theme-surface-alt)_45%,var(--theme-soft)_100%)] shadow-[0_10px_34px_rgb(var(--theme-shadow-rgb)/0.06)]">
        <div className="relative z-10 flex flex-col gap-4 p-6 sm:p-8 lg:max-w-[52%] lg:py-10">
          <div>
            <h1 className="text-[28px] font-black leading-tight text-animeo-dark sm:text-[36px]">
              Bonjour {user?.firstName ?? ""} <span aria-hidden="true">👋</span>
            </h1>
            <p className="mt-1.5 text-base font-bold text-animeo-dark sm:text-lg">Ensemble pour le bien-être animal</p>
            <p className="mt-2 text-sm text-animeo-muted sm:text-base">Voici votre journée en un coup d’œil.</p>
          </div>
          <div>
            <button
              type="button"
              onClick={() => openNewAppointment()}
              className="inline-flex min-h-12 items-center gap-2.5 rounded-2xl bg-animeo px-5 text-sm font-extrabold text-white shadow-[0_10px_22px_color-mix(in_srgb,var(--theme-brand)_28%,transparent)] transition hover:-translate-y-0.5"
            >
              <Icon name="calendarPlus" className="h-5 w-5" />
              Nouveau rendez-vous
              <Icon name="arrow" className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Décoratif : masqué sous lg, où la bannière passe en pleine largeur
            et où l'illustration réduirait la place du texte et du bouton. */}
        <div aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-0 hidden w-[50%] items-end justify-end lg:flex">
          <Image src="/illustrations/animals-group.webp" alt="" width={640} height={280} priority className="h-auto max-h-full w-full max-w-[560px] object-contain object-bottom" />
        </div>
      </section>
    </header>
  );
}
