import { decodeSpreadsheetBytes } from "./decode-file";
import { parseDelimitedText } from "./csv-parse";

export type SpreadsheetResult = { headers: string[]; rows: string[][] };

function isExcelFile(fileName: string): boolean {
  return fileName.toLowerCase().endsWith(".xlsx");
}

function isoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// `read-excel-file` type ses cellules `typeof Date` au lieu de `Date` (bug de
// ses propres déclarations) : la vraie valeur à l'exécution est bien une
// instance de Date, d'où le typage large + vérification à l'exécution.
function cellToString(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return isoDate(value);
  if (typeof value === "number") {
    // Évite la notation scientifique qu'un simple `String(n)` produirait
    // pour les grands nombres (ex. certains codes ou identifiants).
    return Number.isInteger(value) ? value.toString(10) : value.toString();
  }
  if (typeof value === "boolean") return value ? "1" : "0";
  return String(value).trim();
}

// Import de fichiers clients, phase 4 : seule la première feuille d'un
// classeur Excel est lue (l'assistant le signale à l'étape 1) — pas de
// fusion multi-feuilles, ni de choix de feuille, hors périmètre (D11).
async function readExcelSpreadsheet(file: File): Promise<SpreadsheetResult> {
  const { readSheet } = await import("read-excel-file/browser");
  const data = await readSheet(file, 1);
  if (data.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...dataRows] = data;
  const headers = headerRow.map((cell) => cellToString(cell));
  const rows = dataRows.map((row) => headers.map((_label, index) => cellToString(row[index] ?? null)));

  return { headers, rows };
}

async function readCsvSpreadsheet(file: File): Promise<SpreadsheetResult> {
  const bytes = await file.arrayBuffer();
  const text = decodeSpreadsheetBytes(bytes);
  return parseDelimitedText(text);
}

/**
 * Façade unique de lecture de fichier (D2/D3 pour le CSV, phase 4 pour
 * Excel) : route sur le parseur CSV maison ou sur `read-excel-file` selon
 * l'extension, et normalise toujours le résultat au même format (tout en
 * chaînes). `read-excel-file` n'est chargé qu'au moment où un `.xlsx` est
 * réellement déposé (import dynamique) — jamais pour un import CSV.
 */
export async function readSpreadsheet(file: File): Promise<SpreadsheetResult> {
  if (isExcelFile(file.name)) return readExcelSpreadsheet(file);
  return readCsvSpreadsheet(file);
}
