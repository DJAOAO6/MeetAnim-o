"use client";

import { useRef, useState, type DragEvent } from "react";
import { decodeSpreadsheetBytes } from "@/lib/import/decode-file";
import { parseDelimitedText } from "@/lib/import/csv-parse";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".txt"];

export type FileReadResult = { fileName: string; headers: string[]; rows: string[][] };

function hasAcceptedExtension(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return ACCEPTED_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function ClientImportStepFile({ onFileRead }: { onFileRead: (result: FileReadResult) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [reading, setReading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleFile(file: File) {
    setError(null);

    if (!hasAcceptedExtension(file.name)) {
      setError("Format non pris en charge. Utilisez un fichier .csv, .tsv ou .txt.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError(`Ce fichier fait ${(file.size / (1024 * 1024)).toFixed(1)} Mo, la taille maximale est de 5 Mo.`);
      return;
    }

    setReading(true);
    try {
      const bytes = await file.arrayBuffer();
      const text = decodeSpreadsheetBytes(bytes);
      const { headers, rows } = parseDelimitedText(text);

      if (headers.length === 0 || rows.length === 0) {
        setError("Ce fichier est vide ou n'a pas pu être lu. Vérifiez qu'il contient bien une ligne d'en-têtes et au moins une ligne de données.");
        return;
      }

      onFileRead({ fileName: file.name, headers, rows });
    } catch {
      setError("Ce fichier n'a pas pu être lu. Vérifiez qu'il s'agit bien d'un fichier texte tabulaire.");
    } finally {
      setReading(false);
    }
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-animeo-muted">
        Une ligne par animal : un client qui a plusieurs animaux occupe plusieurs lignes avec les mêmes coordonnées.
      </p>

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        className={`flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed p-10 text-center transition ${dragging ? "border-animeo bg-animeo-soft" : "border-[#d9e5e2] bg-animeo-bg hover:border-animeo"}`}
      >
        <UploadIcon />
        <div>
          <p className="font-extrabold text-animeo-dark">Glissez votre fichier ici, ou cliquez pour le choisir</p>
          <p className="mt-1 text-xs text-animeo-muted">CSV, TSV ou TXT — 5 Mo maximum</p>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_EXTENSIONS.join(",")}
          className="sr-only"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFile(file);
            event.target.value = "";
          }}
        />
      </div>

      {reading ? <p className="text-sm font-semibold text-animeo-muted">Lecture du fichier…</p> : null}
      {error ? <p role="alert" className="rounded-xl bg-[#fff1f1] px-4 py-3 text-sm font-bold text-animeo-error">{error}</p> : null}
    </div>
  );
}

function UploadIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="h-9 w-9 text-animeo">
      <path d="M12 15V3m0 0 4 4m-4-4-4 4" />
      <path d="M3 15v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4" />
    </svg>
  );
}
