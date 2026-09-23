"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Rappel tant que la configuration initiale n'est pas terminée : la page de
 * réservation reste fermée d'ici là, et rien d'autre ne le signalerait.
 */
export function OnboardingBanner() {
  const pathname = usePathname();
  if (pathname === "/dashboard/bienvenue") return null;
  return (
    <section aria-label="Configuration à terminer" className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-animeo-border bg-animeo-soft px-4 py-3 text-animeo-dark">
      <p className="text-sm">
        <span className="font-black">Votre espace n’est pas encore configuré.</span> Votre page de réservation ouvrira à la fin de la configuration.
      </p>
      <Link href="/dashboard/bienvenue" className="shrink-0 rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white hover:bg-animeo-deep">Reprendre la configuration</Link>
    </section>
  );
}
