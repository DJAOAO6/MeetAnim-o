"use client";

import { useCurrentUser } from "@/components/auth/current-user-provider";
import { HeaderActions } from "@/components/layout/header-actions";

export function DashboardHeader() {
  const user = useCurrentUser();

  return (
    <header className="mb-6 flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
      <div>
        <h1 className="text-[28px] font-black leading-tight text-animeo-dark sm:text-[32px]">
          Bonjour {user?.firstName ?? ""} <span aria-hidden="true">👋</span>
        </h1>
        <p className="mt-1.5 text-sm text-animeo-muted sm:text-base">Voici votre journée en un coup d’œil.</p>
      </div>
      <div className="flex shrink-0 justify-end">
        <HeaderActions />
      </div>
    </header>
  );
}
