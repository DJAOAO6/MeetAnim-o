"use client";

import { useMemo, useState } from "react";
import type { PreparedRow } from "@/lib/import/build-rows";
import type { ConflictPolicy } from "@/lib/clients-import-actions";
import { animalSpeciesList, type AnimalSpecies } from "@/data/species";

const PAGE_SIZE = 200;

const POLICY_OPTIONS: Array<{ value: ConflictPolicy; label: string; description: string }> = [
  {
    value: "COMPLETE",
    label: "Compléter les fiches existantes",
    description: "Aucun doublon créé : les champs vides des fiches déjà en base sont complétés, les animaux absents sont ajoutés. Rien de déjà saisi n'est jamais écrasé.",
  },
  {
    value: "IGNORE",
    label: "Ignorer les doublons",
    description: "Les lignes correspondant à une fiche déjà en base sont comptées, puis passées — rien n'est modifié.",
  },
  {
    value: "CREER",
    label: "Créer quand même une nouvelle fiche",
    description: "Utile si deux personnes différentes partagent un téléphone ou une adresse : chaque ligne devient une fiche à part.",
  },
];

type RowStatus = "error" | "new" | "merged" | "ignored" | "pending";

function rowStatus(row: PreparedRow, policy: ConflictPolicy, existingGroupIndexes: Set<number> | null): RowStatus {
  if (row.issues.some((issue) => issue.level === "error")) return "error";
  if (!existingGroupIndexes) return "pending";
  const existing = existingGroupIndexes.has(row.groupIndex);
  if (!existing) return "new";
  if (policy === "IGNORE") return "ignored";
  if (policy === "CREER") return "new";
  return "merged";
}

const STATUS_LABELS: Record<RowStatus, string> = {
  error: "Erreur",
  new: "Nouveau",
  merged: "Complété",
  ignored: "Doublon ignoré",
  pending: "Vérification…",
};

const STATUS_CLASSES: Record<RowStatus, string> = {
  error: "bg-[#ffe4e4] text-animeo-error",
  new: "bg-animeo-soft text-animeo-dark",
  merged: "bg-[#fff0d1] text-[#8a5a00]",
  ignored: "bg-[#f0f3f3] text-animeo-muted",
  pending: "bg-[#f0f3f3] text-animeo-muted",
};

export function ClientImportStepReview({
  prepared,
  conflictPolicy,
  onConflictPolicyChange,
  defaultSpecies,
  onDefaultSpeciesChange,
  hasUnrecognizedSpecies,
  excludedLines,
  onToggleExclude,
  existingGroupIndexes,
  onBack,
  onStartImport,
}: {
  prepared: PreparedRow[];
  conflictPolicy: ConflictPolicy;
  onConflictPolicyChange: (policy: ConflictPolicy) => void;
  defaultSpecies: AnimalSpecies;
  onDefaultSpeciesChange: (species: AnimalSpecies) => void;
  hasUnrecognizedSpecies: boolean;
  excludedLines: Set<number>;
  onToggleExclude: (lineNumber: number) => void;
  existingGroupIndexes: Set<number> | null;
  onBack: () => void;
  onStartImport: () => void;
}) {
  const [filter, setFilter] = useState<"all" | "issues">("all");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const counters = useMemo(() => {
    const nonExcluded = prepared.filter((row) => !excludedLines.has(row.lineNumber));
    const errorRows = nonExcluded.filter((row) => row.issues.some((issue) => issue.level === "error")).length;

    const newGroups = new Set<number>();
    const mergedGroups = new Set<number>();
    const ignoredGroups = new Set<number>();
    let animals = 0;

    for (const row of nonExcluded) {
      const status = rowStatus(row, conflictPolicy, existingGroupIndexes);
      if (status === "error") continue;
      if (status === "ignored") {
        ignoredGroups.add(row.groupIndex);
        continue;
      }
      if (status === "merged") mergedGroups.add(row.groupIndex);
      else newGroups.add(row.groupIndex);
      if (row.value.animal) animals += 1;
    }

    return { newClients: newGroups.size, mergedClients: mergedGroups.size, animals, errorRows };
  }, [prepared, excludedLines, conflictPolicy, existingGroupIndexes]);

  const visibleRows = useMemo(() => {
    const filtered = filter === "issues" ? prepared.filter((row) => row.issues.length > 0) : prepared;
    return filtered.slice(0, visibleCount);
  }, [prepared, filter, visibleCount]);

  const totalFiltered = filter === "issues" ? prepared.filter((row) => row.issues.length > 0).length : prepared.length;
  const importCount = counters.newClients + counters.mergedClients;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Counter label="Nouveaux clients" value={counters.newClients} />
        <Counter label="Animaux" value={counters.animals} />
        <Counter label="Fiches complétées" value={counters.mergedClients} />
        <Counter label="Lignes en erreur" value={counters.errorRows} tone={counters.errorRows > 0 ? "error" : "default"} />
      </div>

      <div>
        <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">En cas de doublon avec une fiche existante</p>
        <div className="space-y-2">
          {POLICY_OPTIONS.map((option) => (
            <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3.5 transition ${conflictPolicy === option.value ? "border-animeo bg-animeo-soft" : "border-[#e5eeeb] bg-white hover:bg-animeo-bg"}`}>
              <input type="radio" name="conflictPolicy" checked={conflictPolicy === option.value} onChange={() => onConflictPolicyChange(option.value)} className="mt-1 h-4 w-4 accent-animeo" />
              <span>
                <span className="block font-extrabold text-animeo-dark">{option.label}</span>
                <span className="mt-0.5 block text-xs text-animeo-muted">{option.description}</span>
              </span>
            </label>
          ))}
        </div>
      </div>

      {hasUnrecognizedSpecies ? (
        <label className="block max-w-xs">
          <span className="mb-2 block text-xs font-extrabold uppercase tracking-[0.11em] text-animeo-muted">Espèce par défaut si non reconnue</span>
          <select
            value={defaultSpecies}
            onChange={(event) => onDefaultSpeciesChange(event.target.value as AnimalSpecies)}
            className="h-11 w-full rounded-xl border border-[#d9e5e2] bg-animeo-bg px-3.5 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo"
          >
            {animalSpeciesList.map((species) => <option key={species} value={species}>{species}</option>)}
          </select>
        </label>
      ) : null}

      <div>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex gap-2">
            <button type="button" onClick={() => setFilter("all")} aria-pressed={filter === "all"} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${filter === "all" ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft"}`}>
              Tout ({prepared.length})
            </button>
            <button type="button" onClick={() => setFilter("issues")} aria-pressed={filter === "issues"} className={`rounded-xl px-3 py-2 text-xs font-extrabold transition ${filter === "issues" ? "bg-animeo text-white" : "bg-animeo-bg text-animeo-muted hover:bg-animeo-soft"}`}>
              Anomalies seulement ({prepared.filter((row) => row.issues.length > 0).length})
            </button>
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto rounded-2xl border border-[#e5eeeb]">
          <table className="w-full min-w-[640px] border-collapse text-left text-sm">
            <thead className="sticky top-0 bg-animeo-bg text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">
              <tr>
                <th className="px-4 py-3">Ligne</th>
                <th className="px-4 py-3">Client / animal</th>
                <th className="px-4 py-3">Statut</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3 text-right">Exclure</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#edf2f0]">
              {visibleRows.map((row) => {
                const status = rowStatus(row, conflictPolicy, existingGroupIndexes);
                const excluded = excludedLines.has(row.lineNumber);
                return (
                  <tr key={row.lineNumber} className={excluded ? "opacity-50" : ""}>
                    <td className="px-4 py-2.5 font-bold text-animeo-dark">{row.lineNumber}</td>
                    <td className="px-4 py-2.5 text-animeo-dark">
                      {row.value.firstName || row.value.lastName ? `${row.value.firstName} ${row.value.lastName}`.trim() : <span className="text-animeo-muted">(sans nom)</span>}
                      {row.value.animal ? <span className="text-animeo-muted"> · {row.value.animal.name}</span> : null}
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={`inline-flex rounded-lg px-2 py-1 text-xs font-extrabold ${STATUS_CLASSES[status]}`}>{STATUS_LABELS[status]}</span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-animeo-muted">
                      {row.issues.map((issue, index) => <span key={index} className="block">{issue.message}</span>)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <input type="checkbox" checked={excluded} onChange={() => onToggleExclude(row.lineNumber)} aria-label={`Exclure la ligne ${row.lineNumber}`} className="h-4 w-4 accent-animeo" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {visibleCount < totalFiltered ? (
          <button type="button" onClick={() => setVisibleCount((current) => current + PAGE_SIZE)} className="mt-3 rounded-xl border border-[#d4e2df] px-4 py-2 text-xs font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
            Afficher plus ({totalFiltered - visibleCount} restantes)
          </button>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t border-[#e5eeeb] pt-5">
        <button type="button" onClick={onBack} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
          Retour
        </button>
        <button
          type="button"
          disabled={importCount === 0}
          onClick={onStartImport}
          className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50"
        >
          Importer {importCount} client{importCount > 1 ? "s" : ""}
        </button>
      </div>
    </div>
  );
}

function Counter({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "error" }) {
  return (
    <div className="rounded-2xl bg-animeo-bg p-4">
      <p className={`text-2xl font-black leading-none ${tone === "error" && value > 0 ? "text-animeo-error" : "text-animeo-dark"}`}>{value}</p>
      <p className="mt-1.5 text-xs font-bold text-animeo-muted">{label}</p>
    </div>
  );
}
