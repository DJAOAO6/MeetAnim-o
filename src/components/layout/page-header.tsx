import type { ReactNode } from "react";
import { HeaderActions } from "@/components/layout/header-actions";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
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
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-3">
        {action}
        <HeaderActions />
      </div>
    </header>
  );
}
