// Studio de documents — fabrique d'éléments partagée par les panneaux du
// rail (étape 6). Un seul compteur module-level partagé par tous les
// panneaux : le dupliquer par fichier créerait un compteur par panneau,
// ce qui rouvre un (faible mais réel) risque de collision d'id entre deux
// éléments ajoutés à la même milliseconde depuis deux panneaux différents.

import type { DocumentTextElement } from "@/lib/documents/content";

let elementCounter = 0;

export function newElementId(prefix: string): string {
  elementCounter += 1;
  return `${prefix}-${Date.now()}-${elementCounter}`;
}

export const DEFAULT_POSITION = { x: 60, y: 60 };

export function variableTextElement(token: string, x: number, y: number, width = 220, height = 28): DocumentTextElement {
  return { id: newElementId("text"), type: "text", x, y, width, height, rotation: 0, html: "", variableBinding: token };
}
