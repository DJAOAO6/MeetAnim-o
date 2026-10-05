/** Valeur de cellule CSV (séparateur « ; », guillemets doublés). */
export function csvCell(value: unknown): string {
  const text = value instanceof Date ? value.toISOString() : value === null || value === undefined ? "" : String(value);
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Fichier CSV lisible par un tableur français (BOM, « ; », fins de ligne Windows). */
export function toCsv(header: string[], rows: unknown[][]): string {
  return `\uFEFF${[header, ...rows].map((row) => row.map(csvCell).join(";")).join("\r\n")}\r\n`;
}
