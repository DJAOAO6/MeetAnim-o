import type { ReactNode } from "react";

type PageHeaderProps = {
  title: string;
  description: string;
  action?: ReactNode;
};

export function PageHeader({ title, description, action }: PageHeaderProps) {
  return (
    <header className="mb-8 flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
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
      <div className="flex shrink-0 flex-wrap items-center gap-3">
        {action}
        <div className="hidden items-center gap-3 rounded-[18px] border border-[#dfe9e6] bg-white px-3 py-2 shadow-[0_6px_20px_rgba(24,59,69,0.04)] lg:flex">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[14px] bg-animeo-soft text-sm font-extrabold text-animeo-dark">PF</div>
          <div className="min-w-0 pr-2">
            <p className="truncate text-sm font-bold text-animeo-dark">Pauline Faucillon</p>
            <p className="truncate text-xs text-animeo-muted">PF Ostéo Animale</p>
          </div>
        </div>
      </div>
    </header>
  );
}
