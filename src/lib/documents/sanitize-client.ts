"use client";

import DOMPurify from "dompurify";
import { ALLOWED_TAGS, ALLOWED_URL_SCHEMES, filterStyleDeclarations } from "@/lib/documents/html-policy";

let hooked = false;

/**
 * Seconde barrière, au moment de l'affichage : protège aussi les documents
 * enregistrés avant l'assainissement côté serveur, et tout contenu arrivé par
 * un autre chemin. Même liste blanche que le serveur (html-policy.ts).
 */
export function sanitizeDocumentHtmlForDisplay(html: string): string {
  if (!hooked) {
    // DOMPurify garde l'attribut style en bloc : on ne conserve que les
    // propriétés autorisées, et seulement avec une valeur sûre.
    DOMPurify.addHook("uponSanitizeAttribute", (_node, data) => {
      if (data.attrName !== "style") return;
      data.attrValue = filterStyleDeclarations(data.attrValue);
    });
    hooked = true;
  }

  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: ["style", "href", "target", "rel"],
    ALLOWED_URI_REGEXP: new RegExp(`^(?:${ALLOWED_URL_SCHEMES.join("|")}):`, "i"),
  });
}
