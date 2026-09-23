"use client";

import { useTransition } from "react";
import { endAssistanceAction } from "@/lib/platform/assistance-actions";

const timeFormatter = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

/**
 * Bandeau d'assistance : présent sur chaque écran tant que dure
 * l'assistance, impossible à masquer. Celui qui assiste doit savoir à tout
 * instant qu'il agit au nom de quelqu'un d'autre — et pour combien de temps.
 */
export function AssistanceBanner({ assistedName, impersonatorName, reason, expiresAt }: {
  assistedName: string;
  impersonatorName: string;
  reason: string;
  expiresAt: string;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <section
      aria-label="Mode assistance"
      className="sticky top-0 z-40 mb-6 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border-2 border-animeo-warning bg-animeo-warning-soft px-4 py-3 text-animeo-dark shadow-sm"
    >
      <div className="min-w-0 text-sm">
        <p className="font-black">
          Mode assistance — vous agissez dans l’espace de {assistedName}
        </p>
        <p className="text-animeo-dark">
          {impersonatorName} · motif : « {reason} » · fin automatique à {timeFormatter.format(new Date(expiresAt))}. Chaque action est inscrite à votre nom au journal de ce cabinet.
        </p>
      </div>
      <button
        type="button"
        disabled={pending}
        onClick={() => startTransition(async () => { await endAssistanceAction(); })}
        className="shrink-0 rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-animeo-deep disabled:opacity-70"
      >
        {pending ? "Fin en cours…" : "Terminer l’assistance"}
      </button>
    </section>
  );
}
