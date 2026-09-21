// Pas de `import "server-only"` : ce module ne contient aucun secret, et
// doit rester importable par les tests unitaires. Il n'est destiné qu'au
// serveur pour autant — côté navigateur, utiliser sanitize-client.ts
// (DOMPurify), bien plus léger que sanitize-html.
import sanitizeHtml from "sanitize-html";
import { ALLOWED_TAGS, ALLOWED_URL_SCHEMES, filterStyleDeclarations } from "@/lib/documents/html-policy";
import type { DocumentContent } from "@/lib/documents/content";

/**
 * Le style est filtré sur sa valeur brute, avant que sanitize-html ne
 * l'encode : une fois encodée, une police entre guillemets devient
 * `&quot;Playfair Display&quot;` et chaque `&quot;` contient un point-virgule
 * — la découper alors couperait la déclaration en morceaux. Et un style dont
 * rien n'est retiré est rendu tel quel, octet pour octet : un assainisseur n'a
 * pas à reformater ce qui est déjà sûr.
 */
function keepSafeStyle(tagName: string, attribs: sanitizeHtml.Attributes): sanitizeHtml.Tag {
  const next = { ...attribs };
  if (typeof next.style === "string") {
    const style = filterStyleDeclarations(next.style);
    if (style) next.style = style;
    else delete next.style;
  }
  // Un lien ouvert dans un nouvel onglet ne doit pas pouvoir piloter
  // l'onglet du logiciel (window.opener).
  if (tagName === "a") next.rel = "noopener noreferrer";
  return { tagName, attribs: next };
}

const options: sanitizeHtml.IOptions = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: { "*": ["style"], a: ["href", "target", "rel"] },
  allowedSchemes: ALLOWED_URL_SCHEMES,
  // Le filtrage des propriétés CSS est fait par keepSafeStyle, qui garde
  // l'écriture d'origine ; celui de sanitize-html réécrirait chaque style.
  parseStyleAttributes: false,
  // Balises interdites retirées ; celles qui portent du code (script, style)
  // avec leur contenu.
  disallowedTagsMode: "discard",
  transformTags: Object.fromEntries(ALLOWED_TAGS.map((tag) => [tag, keepSafeStyle])),
};

export function sanitizeDocumentHtml(html: string): string {
  return sanitizeHtml(html, options);
}

/**
 * Assainit le HTML de chaque bloc de texte d'un document avant écriture en
 * base. Le reste du contenu (formes, images, positions) n'est pas du HTML et
 * n'est jamais réinjecté comme tel.
 */
export function sanitizeDocumentContent(content: DocumentContent): DocumentContent {
  return {
    ...content,
    pages: content.pages.map((page) => ({
      ...page,
      elements: page.elements.map((element) =>
        element.type === "text" && typeof element.html === "string" ? { ...element, html: sanitizeDocumentHtml(element.html) } : element,
      ),
    })),
  };
}
