"use client";

import type { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";

/**
 * Coquille commune à tous les blocs du tableau de bord.
 *
 * Elle existe pour une seule raison, mais qui est la bonne : avant, chaque
 * bloc décidait seul de son padding, de la taille de son icône, de la
 * hauteur de son en-tête et de sa marge basse. Deux cartes voisines ne
 * tombaient donc jamais au même endroit, et c'est ce qui donnait au tableau
 * de bord son air assemblé bloc par bloc.
 *
 * `h-full` + colonne flex : les cartes d'une même rangée de la grille
 * s'étirent à la hauteur de la plus haute, et leur pied (bouton « Voir
 * tout… ») se retrouve aligné d'une carte à l'autre grâce à `footer`, qui est
 * poussé en bas.
 */
export function DashboardCard({ children, footer, className = "", ...header }: DashboardCardHeaderProps & {
  children?: ReactNode;
  /** Collé en bas de la carte : les pieds d'une même rangée s'alignent. */
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Card className={`flex h-full flex-col p-[var(--dashboard-card-padding)] ${className}`}>
      {header.title ? <DashboardCardHeader {...header} /> : null}
      {children}
      {footer ? <div className="mt-auto pt-[var(--dashboard-card-gap)]">{footer}</div> : null}
    </Card>
  );
}

type DashboardCardHeaderProps = {
  title?: string;
  /** Petite ligne au-dessus du titre (« Prochaine tournée »). */
  eyebrow?: string;
  subtitle?: string;
  icon?: IconName;
  /** Teinte de la pastille d'icône, pour les blocs qui appellent à agir. */
  tone?: "neutral" | "warning";
  /** Lien ou sélecteur aligné à droite du titre. */
  action?: ReactNode;
};

export function DashboardCardHeader({ title, eyebrow, subtitle, icon, tone = "neutral", action }: DashboardCardHeaderProps) {
  const toneClassName = tone === "warning" ? "bg-animeo-warning-soft text-animeo-warning" : "bg-animeo-soft text-animeo-dark";

  return (
    <div className="mb-[var(--dashboard-card-gap)] flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon ? (
          <span aria-hidden="true" className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl ${toneClassName}`}>
            <Icon name={icon} className="h-5 w-5" />
          </span>
        ) : null}
        <div className="min-w-0">
          {eyebrow ? <p className="text-[11px] font-extrabold uppercase tracking-[0.12em] text-animeo-muted">{eyebrow}</p> : null}
          {/* Deux lignes plutôt qu'une troncature : un titre coupé à
              « Ouvert aujo… » ne dit plus rien, alors qu'un titre sur deux
              lignes reste lisible et garde une hauteur bornée. */}
          {title ? <h2 className="line-clamp-2 text-base font-black text-animeo-dark">{title}</h2> : null}
          {subtitle ? <p className="mt-0.5 truncate text-xs text-animeo-muted">{subtitle}</p> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

/**
 * Absence de données. Volontairement court : une journée sans rendez-vous est
 * une bonne nouvelle, pas un incident, et elle ne mérite pas trois cents
 * pixels de vide au milieu du tableau de bord. Le message dit ce qu'il en est
 * et propose l'action qui suit.
 */
export function DashboardEmptyState({ icon = "calendar", title, message, action }: {
  icon?: IconName;
  title: string;
  message?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 rounded-2xl bg-animeo-bg px-4 py-6 text-center">
      <span aria-hidden="true" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-animeo-dark shadow-sm">
        <Icon name={icon} className="h-5 w-5" />
      </span>
      <p className="mt-2 text-sm font-extrabold text-animeo-dark">{title}</p>
      {message ? <p className="max-w-sm text-xs text-animeo-muted">{message}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/**
 * Pied de carte menant à la page complète. Même forme partout : c'est ce qui
 * fait qu'on le reconnaît sans le lire.
 */
export function dashboardFooterLinkClassName(tone: "neutral" | "warning" = "neutral") {
  const toneClassName = tone === "warning"
    ? "bg-animeo-warning-soft text-animeo-warning hover:brightness-95"
    : "bg-animeo-soft text-animeo-dark hover:bg-animeo-soft-strong";
  return `flex min-h-11 w-full items-center justify-center rounded-2xl px-4 text-sm font-extrabold transition ${toneClassName}`;
}
