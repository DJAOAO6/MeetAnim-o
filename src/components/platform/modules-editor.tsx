"use client";

import { useState, useTransition } from "react";
import { setOrganizationModulesAction } from "@/lib/platform/module-actions";
import { MODULE_KEYS, MODULES, type ModuleKey } from "@/lib/modules";

/**
 * Les modules d'un espace, cochés ou non. Rien n'est appliqué avant
 * « Enregistrer » : décocher par erreur ne ferme rien à l'espace.
 */
export function ModulesEditor({ organizationId, organizationName, initialModules }: { organizationId: string; organizationName: string; initialModules: string[] }) {
  const [saved, setSaved] = useState<string[]>(initialModules);
  const [draft, setDraft] = useState<string[]>(initialModules);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const dirty = MODULE_KEYS.some((key) => draft.includes(key) !== saved.includes(key));

  function toggle(key: ModuleKey) {
    setMessage(null);
    setDraft((current) => (current.includes(key) ? current.filter((item) => item !== key) : [...current, key]));
  }

  function save() {
    startTransition(async () => {
      const result = await setOrganizationModulesAction(organizationId, draft);
      if (!result.ok) return setMessage({ tone: "error", text: result.error });
      setSaved(result.modules);
      setDraft(result.modules);
      setMessage({ tone: "ok", text: "Modules enregistrés. L’espace les voit à sa prochaine page." });
    });
  }

  return (
    <fieldset className="mt-4 rounded-2xl border border-animeo-border-soft bg-animeo-bg p-4">
      <legend className="px-1 text-sm font-extrabold text-animeo-dark">Modules de {organizationName}</legend>
      <p className="text-xs text-animeo-muted">Toujours inclus : tableau de bord, agenda, réservation en ligne, clients et animaux, prestations, rappel automatique de rendez-vous.</p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {MODULE_KEYS.map((key) => (
          <label key={key} className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-animeo-border bg-white px-3 py-2.5">
            <input type="checkbox" checked={draft.includes(key)} onChange={() => toggle(key)} className="mt-0.5 h-4 w-4 accent-[var(--theme-brand)]" />
            <span>
              <span className="block text-sm font-bold text-animeo-dark">{MODULES[key].label}</span>
              <span className="block text-xs text-animeo-muted">{MODULES[key].description}</span>
            </span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button type="button" onClick={save} disabled={pending || !dirty} className="rounded-xl bg-animeo-dark px-4 py-2.5 text-sm font-extrabold text-white transition hover:bg-animeo-deep disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer les modules"}
        </button>
        {message ? <p role={message.tone === "error" ? "alert" : "status"} className={`text-sm font-bold ${message.tone === "error" ? "text-animeo-danger" : "text-animeo-dark"}`}>{message.text}</p> : null}
      </div>
    </fieldset>
  );
}
