/**
 * Détection du séparateur : comptage des occurrences hors guillemets sur la
 * première ligne du fichier, priorité `;` puis `,` puis tabulation en cas
 * d'égalité — un export Excel français produit typiquement du `;` (D3).
 */
export function detectDelimiter(firstLine: string): ";" | "," | "\t" {
  const counts = { ";": 0, ",": 0, "\t": 0 };
  let inQuotes = false;

  for (const char of firstLine) {
    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }
    if (inQuotes) continue;
    if (char === ";" || char === "," || char === "\t") counts[char] += 1;
  }

  if (counts[";"] >= counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts[","] >= counts["\t"]) return ",";
  return "\t";
}

/**
 * Parseur CSV/TSV maison (D2) : guillemets, guillemets échappés `""`,
 * séparateur détecté automatiquement sur la première ligne, séparateurs et
 * sauts de ligne à l'intérieur des champs entre guillemets, `\r\n` et `\n`.
 * Les lignes entièrement vides sont ignorées ; les lignes plus courtes que
 * l'en-tête sont complétées par des chaînes vides.
 */
export function parseDelimitedText(text: string): { headers: string[]; rows: string[][] } {
  const firstLineEnd = text.search(/\r\n|\n/);
  const firstLine = firstLineEnd === -1 ? text : text.slice(0, firstLineEnd);
  const delimiter = detectDelimiter(firstLine);

  const allRows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  let index = 0;

  function pushField() {
    row.push(field);
    field = "";
  }

  function pushRow() {
    pushField();
    allRows.push(row);
    row = [];
  }

  while (index < text.length) {
    const char = text[index];

    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        inQuotes = false;
        index += 1;
        continue;
      }
      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      index += 1;
      continue;
    }
    if (char === delimiter) {
      pushField();
      index += 1;
      continue;
    }
    if (char === "\r") {
      if (text[index + 1] === "\n") index += 1;
      pushRow();
      index += 1;
      continue;
    }
    if (char === "\n") {
      pushRow();
      index += 1;
      continue;
    }
    field += char;
    index += 1;
  }

  if (field !== "" || row.length > 0) pushRow();

  const nonEmptyRows = allRows.filter((current) => !(current.length === 1 && current[0] === ""));
  if (nonEmptyRows.length === 0) return { headers: [], rows: [] };

  const [headerRow, ...dataRows] = nonEmptyRows;
  const headerLength = headerRow.length;

  const rows = dataRows.map((current) =>
    current.length >= headerLength ? current : [...current, ...Array(headerLength - current.length).fill("")],
  );

  return { headers: headerRow, rows };
}
