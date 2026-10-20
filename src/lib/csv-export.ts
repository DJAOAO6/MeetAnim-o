/**
 * Valeur de cellule CSV (séparateur « ; », guillemets doublés).
 *
 * Un texte qui commence par = + - @ (ou une tabulation, un retour chariot)
 * deviendrait une formule à l'ouverture dans un tableur : un nom saisi sur
 * la page de réservation pouvait s'exécuter chez celui qui ouvre l'export
 * (SEC-21). Il est préfixé d'une apostrophe, qui le garde en texte. Les
 * nombres, eux, restent des nombres.
 */
export function csvCell(value: unknown): string {
  const raw = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(value);
  const text = typeof value === "string" && /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Fichier CSV lisible par un tableur français (BOM, « ; », fins de ligne Windows). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
