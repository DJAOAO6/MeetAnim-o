import type { ReactNode } from "react";

/**
 * Habillage partagé des panneaux contextuels du rail (étape 6) — pas un
 * système de tokens, juste évite de recopier le même markup d'en-tête/scroll
 * dans chacun des ~6 panneaux. Langage visuel volontairement plus restreint
 * que le reste de l'app (radius/ombres Tailwind par défaut, pas les valeurs
 * arbitraires de `Card`) — voir le plan, section "Décisions et arbitrages".
 */
export function StudioPanel({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <aside id={id} className="flex h-full w-64 shrink-0 flex-col border-r border-neutral-200 bg-white">
      <div className="border-b border-neutral-200 px-4 py-3">
        <h2 className="text-sm font-bold text-neutral-800">{title}</h2>
      </div>
      <div className="flex-1 space-y-5 overflow-y-auto p-4">{children}</div>
    </aside>
  );
}

export function StudioSectionLabel({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-neutral-500">{children}</p>;
}
