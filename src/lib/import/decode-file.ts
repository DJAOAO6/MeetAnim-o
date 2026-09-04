const UTF8_BOM = [0xef, 0xbb, 0xbf];

function hasUtf8Bom(bytes: Uint8Array): boolean {
  return bytes.length >= 3 && bytes[0] === UTF8_BOM[0] && bytes[1] === UTF8_BOM[1] && bytes[2] === UTF8_BOM[2];
}

/**
 * Un export Excel français utilise très souvent l'encodage windows-1252
 * (accents cassés en UTF-8 strict) : on tente UTF-8 en mode strict d'abord
 * (respecte les vrais fichiers UTF-8, avec ou sans BOM), et on se replie sur
 * windows-1252 seulement si le décodage strict échoue.
 */
export function decodeSpreadsheetBytes(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes);
  const withoutBom = hasUtf8Bom(view) ? view.subarray(3) : view;

  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(withoutBom);
  } catch {
    return new TextDecoder("windows-1252").decode(withoutBom);
  }
}
