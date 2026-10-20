"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Button, buttonBaseClassName, buttonSizeClassName, buttonVariantClassName } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import type { Animal } from "@/data/clients";
import type { StudioDocumentSummary } from "@/data/documents";
import { getDocumentsForAnimal } from "@/lib/documents-actions";
import { FileText } from "lucide-react";

type AnimalSideCardsProps = {
  animal: Animal;
  onScheduleReminder: () => void;
  /** Faux sans le module Rappels clients (src/lib/modules.ts). */
  showReminder?: boolean;
  /** Faux sans le module Documents. */
  showDocuments?: boolean;
};

export function AnimalSideCards({ animal, onScheduleReminder, showReminder = true, showDocuments = true }: AnimalSideCardsProps) {
  if (!showDocuments && !showReminder) return null;
  return (
    <aside className="grid gap-6 sm:grid-cols-2 2xl:sticky 2xl:top-6 2xl:grid-cols-1" aria-label={`Documents et rappel de ${animal.name}`}>
      {showDocuments ? <DocumentsCard animal={animal} /> : null}
      {showReminder ? <ReminderCard animal={animal} onScheduleReminder={onScheduleReminder} /> : null}
    </aside>
  );
}

/**
 * Les comptes rendus du Studio rédigés pour cet animal (audit 2026-10,
 * FONC-01). La carte affichait auparavant une liste et trois boutons qui ne
 * faisaient rien (« sera ajouté ici ») : un professionnel croyait à une panne.
 */
function DocumentsCard({ animal }: { animal: Animal }) {
  const [documents, setDocuments] = useState<StudioDocumentSummary[] | null>(null);
  useEffect(() => {
    let alive = true;
    getDocumentsForAnimal(animal.id)
      .then((rows) => { if (alive) setDocuments(rows); })
      .catch(() => { if (alive) setDocuments([]); });
    return () => { alive = false; };
  }, [animal.id]);

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo">Documents</p>
          <h2 className="mt-1 font-extrabold text-animeo-dark">Comptes rendus de {animal.name}</h2>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-animeo-soft text-animeo-dark">
          <FileText aria-hidden="true" className="h-5 w-5" />
        </div>
      </div>

      {documents === null ? (
        <p role="status" className="mt-4 rounded-2xl bg-animeo-bg p-4 text-sm font-semibold text-animeo-muted">Chargement…</p>
      ) : documents.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {documents.slice(0, 5).map((document) => (
            <li key={document.id}>
              <Link href={`/dashboard/documents/${document.id}`} className="flex w-full items-center gap-3 rounded-2xl border border-animeo-border-soft bg-animeo-bg p-3 text-left transition hover:border-animeo">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-xs font-black ${document.status === "Finalisé" ? "bg-animeo-danger-soft text-animeo-danger" : "bg-animeo-info-soft text-animeo-dark"}`}>
                  {document.status === "Finalisé" ? "PDF" : "…"}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-extrabold text-animeo-dark">{document.title}</span>
                  <span className="mt-0.5 block truncate text-xs font-semibold text-animeo-muted">
                    {document.status} · {new Date(document.updatedAt).toLocaleDateString("fr-FR")}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl bg-animeo-bg p-4 text-sm font-semibold text-animeo-muted">Aucun compte rendu pour cet animal.</p>
      )}

      <Link href="/dashboard/documents" className={`mt-4 w-full ${buttonBaseClassName} ${buttonVariantClassName.secondary} ${buttonSizeClassName.md}`}>
        Voir tous les documents
      </Link>
    </Card>
  );
}

function ReminderCard({ animal, onScheduleReminder }: { animal: Animal; onScheduleReminder: () => void }) {
  return (
    <Card className="overflow-hidden sm:self-start">
      <div className="bg-animeo-warning-soft p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[0.13em] text-animeo-warning">Prochain rappel</p>
            <h2 className="mt-2 text-xl font-black text-animeo-dark">{animal.reminder.label}</h2>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-white text-animeo-warning">
            <Icon name="bell" className="h-5 w-5" />
          </div>
        </div>
        <p className="mt-3 text-sm font-bold text-animeo-muted">Prévu le {animal.reminder.date}</p>
        <p className="mt-2 text-xs leading-relaxed text-animeo-muted">Ce rappel est associé uniquement à {animal.name}, pas à toute la fiche propriétaire.</p>
      </div>
      <div className="p-4">
        <Button type="button" variant="secondary" onClick={onScheduleReminder} className="w-full">
          Programmer un rappel
        </Button>
      </div>
    </Card>
  );
}

