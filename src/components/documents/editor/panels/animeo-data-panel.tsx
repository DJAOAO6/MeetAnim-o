"use client";

import { useState } from "react";
import { useDocumentStore } from "@/components/documents/editor/document-store";
import { StudioPanel, StudioSectionLabel } from "@/components/documents/editor/studio-chrome";
import { DEFAULT_POSITION, variableTextElement } from "@/components/documents/editor/element-factory";
import { documentVariables, type DocumentVariableDefinition } from "@/lib/documents/variables";

function groupVariables(variables: DocumentVariableDefinition[]): [string, DocumentVariableDefinition[]][] {
  const groups = new Map<string, DocumentVariableDefinition[]>();
  for (const variable of variables) {
    const list = groups.get(variable.group) ?? [];
    list.push(variable);
    groups.set(variable.group, list);
  }
  return Array.from(groups.entries());
}

export function AnimeoDataPanel({ readOnly }: { readOnly: boolean }) {
  const addElement = useDocumentStore((state) => state.addElement);
  const [search, setSearch] = useState("");

  function insertVariable(token: string) {
    addElement(variableTextElement(token, DEFAULT_POSITION.x, DEFAULT_POSITION.y));
  }

  const filtered = search.trim()
    ? documentVariables.filter((variable) => variable.label.toLocaleLowerCase("fr-FR").includes(search.trim().toLocaleLowerCase("fr-FR")))
    : documentVariables;
  const variableGroups = groupVariables(filtered);

  return (
    <StudioPanel id="studio-panel-data" title="Données 1002 Pattes">
      <label className="block">
        <span className="sr-only">Rechercher une donnée 1002 Pattes</span>
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Rechercher…"
          className="h-9 w-full rounded-md border border-neutral-200 bg-neutral-50 px-3 text-sm text-neutral-800 outline-none focus:border-animeo focus:bg-white"
        />
      </label>

      {variableGroups.length === 0 ? (
        <p className="text-sm text-neutral-500">Aucune donnée ne correspond à « {search} ».</p>
      ) : (
        <div className="space-y-4">
          {variableGroups.map(([group, variables]) => (
            <div key={group}>
              <StudioSectionLabel>{group}</StudioSectionLabel>
              <div className="flex flex-wrap gap-1.5">
                {variables.map((variable) => (
                  <button
                    key={variable.token}
                    type="button"
                    onClick={() => insertVariable(variable.token)}
                    disabled={readOnly}
                    title={`Insérer ${variable.label}`}
                    className="rounded-md bg-neutral-100 px-2.5 py-1.5 text-[11px] font-semibold text-neutral-700 transition hover:bg-animeo-soft hover:text-animeo-dark disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {variable.label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </StudioPanel>
  );
}
