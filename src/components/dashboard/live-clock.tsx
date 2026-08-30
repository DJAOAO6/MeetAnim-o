"use client";

import { useEffect, useState } from "react";
import { useHasMounted } from "@/components/ui/use-has-mounted";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long" });
const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function formatDate(date: Date) {
  const label = dateFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

/**
 * Date du jour + heure en direct, dans l'en-tête partagé (HeaderActions).
 * Isolé dans son propre composant pour que la mise à jour minute par minute
 * ne re-rende que ce bloc, pas tout le reste de l'en-tête (recherche, avatar).
 * useHasMounted (plutôt qu'un setState direct dans un effet) évite tout
 * désaccord d'hydratation entre l'heure du serveur au moment du rendu et
 * celle du navigateur au moment de l'affichage.
 */
export function LiveClock() {
  const hasMounted = useHasMounted();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(interval);
  }, []);

  if (!hasMounted) return null;

  return (
    <div className="hidden h-12 shrink-0 flex-col justify-center rounded-2xl border border-[#e1eae8] bg-white px-4 shadow-[0_4px_16px_rgba(21,63,71,0.04)] lg:flex">
      <span className="text-[11px] font-bold capitalize leading-tight text-animeo-muted">{formatDate(now)}</span>
      <span className="text-sm font-black leading-tight text-animeo-dark">{timeFormatter.format(now)}</span>
    </div>
  );
}
