"use client";

import { useCurrentUser } from "@/components/auth/current-user-provider";

export function DashboardHeader() {
  const user = useCurrentUser();

  return (
    <div className="mb-6">
      <h1 className="text-[28px] font-black leading-tight text-animeo-dark sm:text-[32px]">
        Bonjour {user?.firstName ?? ""} <span aria-hidden="true">👋</span>
      </h1>
      <p className="mt-1.5 text-sm text-animeo-muted sm:text-base">Voici votre journée en un coup d’œil.</p>
    </div>
  );
}
