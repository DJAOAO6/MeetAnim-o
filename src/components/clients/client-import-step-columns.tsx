"use client";

import { IMPORT_FIELD_LABELS, type ImportField } from "@/lib/import/fields";

const ALL_FIELDS = Object.keys(IMPORT_FIELD_LABELS) as ImportField[];
const PREVIEW_ROW_COUNT = 5;

export function ClientImportStepColumns({
  headers,
  rawRows,
  mapping,
  onMappingChange,
  onBack,
  onContinue,
}: {
  headers: string[];
  rawRows: string[][];
  mapping: Partial<Record<ImportField, number>>;
  onMappingChange: (mapping: Partial<Record<ImportField, number>>) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  const canContinue = mapping.firstName !== undefined && mapping.lastName !== undefined;
  const mappedFields = ALL_FIELDS.filter((field) => mapping[field] !== undefined);
  const previewRows = rawRows.slice(0, PREVIEW_ROW_COUNT);

  function setColumnField(columnIndex: number, field: ImportField | "") {
    const next: Partial<Record<ImportField, number>> = {};
    for (const key of ALL_FIELDS) {
      const currentIndex = mapping[key];
      if (currentIndex === undefined) continue;
      if (currentIndex === columnIndex) continue; // cette colonne change d'affectation
      if (field && key === field) continue; // le champ choisi change de colonne
      next[key] = currentIndex;
    }
    if (field) next[field] = columnIndex;
    onMappingChange(next);
  }

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto rounded-2xl border border-[#e5eeeb]">
        <table className="w-full min-w-[520px] border-collapse text-left text-sm">
          <thead className="bg-animeo-bg text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">
            <tr>
              <th className="px-4 py-3">Colonne du fichier</th>
              <th className="px-4 py-3">Champ Animéo</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#edf2f0]">
            {headers.map((header, columnIndex) => {
              const currentField = ALL_FIELDS.find((field) => mapping[field] === columnIndex) ?? "";
              return (
                <tr key={columnIndex}>
                  <td className="px-4 py-2.5 font-bold text-animeo-dark">{header || <span className="text-animeo-muted">(sans en-tête)</span>}</td>
                  <td className="px-4 py-2.5">
                    <select
                      value={currentField}
                      onChange={(event) => setColumnField(columnIndex, (event.target.value || "") as ImportField | "")}
                      className="h-10 w-full max-w-xs rounded-xl border border-[#d9e5e2] bg-white px-3 text-sm font-semibold text-animeo-dark outline-none focus:border-animeo"
                    >
                      <option value="">Ne pas importer</option>
                      {ALL_FIELDS.map((field) => (
                        <option key={field} value={field} disabled={mapping[field] !== undefined && mapping[field] !== columnIndex}>
                          {IMPORT_FIELD_LABELS[field]}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {mappedFields.length > 0 && previewRows.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-animeo-muted">Aperçu des {previewRows.length} premières lignes</p>
          <div className="overflow-x-auto rounded-2xl border border-[#e5eeeb]">
            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
              <thead className="bg-animeo-bg text-xs font-extrabold uppercase tracking-[0.08em] text-animeo-muted">
                <tr>
                  {mappedFields.map((field) => (
                    <th key={field} className="px-4 py-3">{IMPORT_FIELD_LABELS[field]}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[#edf2f0]">
                {previewRows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {mappedFields.map((field) => (
                      <td key={field} className="px-4 py-2.5 text-animeo-dark">{row[mapping[field]!] || <span className="text-animeo-muted">—</span>}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3 border-t border-[#e5eeeb] pt-5">
        <button type="button" onClick={onBack} className="rounded-xl border border-[#d4e2df] px-5 py-2.5 text-sm font-extrabold text-animeo-dark transition hover:bg-animeo-bg">
          Retour
        </button>
        <div className="text-right">
          {!canContinue ? <p className="mb-2 text-xs font-bold text-animeo-error">Associez au moins les colonnes Nom et Prénom pour continuer.</p> : null}
          <button
            type="button"
            disabled={!canContinue}
            onClick={onContinue}
            className="rounded-xl bg-animeo px-6 py-2.5 text-sm font-extrabold text-white transition hover:bg-[#459e90] disabled:cursor-not-allowed disabled:opacity-50"
          >
            Continuer
          </button>
        </div>
      </div>
    </div>
  );
}
