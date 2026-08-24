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
        <h1 className="text-3xl font-extrabold tracking-tight text-animeo-dark sm:text-4xl">
          {title}
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-animeo-muted sm:text-base">
          {description}
        </p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
  );
}
