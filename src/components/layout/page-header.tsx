import type { ReactNode } from "react";
import { HeaderActions } from "@/components/layout/header-actions";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8">
      <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.18em] text-animeo">
            Espace professionnel
          </p>
          <h1 className="text-[32px] font-bold leading-tight tracking-tight text-animeo-dark">
            {title}
          </h1>
          <p className="mt-2 max-w-2xl text-sm text-animeo-muted sm:text-base">
            {description}
          </p>
        </div>
        <HeaderActions />
      </div>
      {/* Actions propres à la page (ex. "Nouveau client") sur leur propre
          rangée, alignées à droite en dessous — jamais mélangées à
          l'horloge/recherche/cloche partagées ci-dessus, pour ne pas
          surcharger une même ligne de boutons hétérogènes. */}
      {action ? (
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          {action}
        </div>
      ) : null}
    </header>
  );
}
