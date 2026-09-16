"use client";

import { useMemo } from "react";
import { useHasMounted } from "@/components/ui/use-has-mounted";
import { dateId, referenceDate, startOfWeek, weekDatesFrom } from "@/components/dashboard/dashboard-date";

export type DashboardPeriod = "week" | "month" | "year";

export const dashboardPeriodOptions: Array<{ value: DashboardPeriod; label: string }> = [
  { value: "week", label: "Cette semaine" },
  { value: "month", label: "Ce mois-ci" },
  { value: "year", label: "Cette année" },
];

/**
 * Période commune aux cartes d'analyse du tableau de bord.
 *
 * `mounted` n'est pas un détail : la période se calcule à partir de l'horloge
 * de la machine qui l'exécute. Le serveur et le navigateur peuvent être dans
 * deux fuseaux — ou de part et d'autre de minuit — et rendre alors deux
 * contenus différents, ce que React signale comme une erreur d'hydratation.
 * Les cartes affichent donc un état vide identique des deux côtés, puis la
 * vraie période une fois montées.
 */
export function useDashboardPeriod(period: DashboardPeriod) {
  const mounted = useHasMounted();

  return useMemo(() => {
    if (!mounted) return { mounted, contains: () => false, rangeLabel: "" };

    const today = referenceDate();
    const todayId = dateId(today);

    if (period === "week") {
      const ids = new Set(weekDatesFrom(startOfWeek(today)).map(dateId));
      return { mounted, contains: (day: string) => ids.has(day), rangeLabel: "du lundi au dimanche" };
    }

    if (period === "month") {
      const prefix = todayId.slice(0, 7);
      return { mounted, contains: (day: string) => day.startsWith(prefix), rangeLabel: "depuis le 1er du mois" };
    }

    const prefix = todayId.slice(0, 4);
    return { mounted, contains: (day: string) => day.startsWith(prefix), rangeLabel: "depuis le 1er janvier" };
  }, [mounted, period]);
}

/**
 * Sélecteur de période. Un `select` natif, et non un menu maison : il est
 * utilisable au clavier et au doigt sans rien réécrire, et il reste lisible
 * dans le coin d'une carte où un menu déroulant personnalisé déborderait.
 */
export function PeriodSelect({ value, onChange, label }: {
  value: DashboardPeriod;
  onChange: (value: DashboardPeriod) => void;
  label: string;
}) {
  return (
    <select
      value={value}
      aria-label={label}
      onChange={(event) => onChange(event.target.value as DashboardPeriod)}
      className="min-h-9 rounded-xl border border-animeo-border bg-animeo-bg px-2.5 text-xs font-extrabold text-animeo-dark outline-none transition focus-visible:border-animeo"
    >
      {dashboardPeriodOptions.map((option) => (
        <option key={option.value} value={option.value}>{option.label}</option>
      ))}
    </select>
  );
}
