/**
 * Ce qu'un bloc de texte de compte rendu a le droit de contenir.
 *
 * Le HTML d'un document est enregistré tel quel en base puis réinjecté dans
 * la page (StaticTextBlock) : sans filtre, un `<img onerror>` s'y exécute
 * dans la session de quiconque ouvre le document — administrateur compris.
 *
 * La liste est tirée de ce que produisent réellement l'éditeur (Tiptap :
 * StarterKit, TextStyleKit, TextAlign) et les modèles fournis
 * (prisma/seed-document-templates.ts, legendHtml) : rien de ce qu'ils
 * écrivent n'est perdu, tout le reste l'est. Liste blanche, jamais liste
 * noire — on ne devine pas tous les moyens d'exécuter du code.
 *
 * Partagé par le serveur (assainissement à l'enregistrement, sanitize-html)
 * et le navigateur (assainissement à l'affichage, DOMPurify) : un seul
 * endroit à tenir à jour, deux barrières.
 */

export const ALLOWED_TAGS = [
  "p", "br", "span", "strong", "b", "em", "i", "u", "s", "mark", "code", "sub", "sup",
  "h1", "h2", "h3", "h4", "blockquote", "ul", "ol", "li", "hr", "a",
];

/** Propriétés CSS inline produites par l'éditeur et les modèles. */
export const ALLOWED_STYLE_PROPERTIES = [
  "color", "background-color", "font-size", "font-family", "font-weight", "font-style",
  "line-height", "letter-spacing", "text-align", "text-transform", "text-decoration", "margin",
];

/** Liens : seulement vers le web ou une adresse mail, jamais `javascript:`. */
export const ALLOWED_URL_SCHEMES = ["http", "https", "mailto"];

/**
 * Valeur de style acceptable : pas d'URL (une image de fond distante suffit à
 * pister qui ouvre le document), pas d'expression, pas d'échappement.
 */
export function isSafeStyleValue(value: string): boolean {
  return !/url\s*\(|expression\s*\(|javascript:|\\|@import/i.test(value);
}

/**
 * Ne garde d'un attribut style (valeur brute, non encodée) que les
 * propriétés autorisées, avec une valeur sûre. Renvoie la valeur d'origine
 * inchangée si rien n'est retiré, une chaîne vide si plus rien ne reste.
 */
export function filterStyleDeclarations(style: string): string {
  const declarations = style.split(";").map((declaration) => declaration.trim()).filter(Boolean);
  const kept = declarations.filter((declaration) => {
    const colon = declaration.indexOf(":");
    if (colon <= 0) return false;
    const property = declaration.slice(0, colon).trim().toLowerCase();
    return ALLOWED_STYLE_PROPERTIES.includes(property) && isSafeStyleValue(declaration.slice(colon + 1));
  });
  if (kept.length === declarations.length) return style.trim();
  return kept.join("; ");
}
