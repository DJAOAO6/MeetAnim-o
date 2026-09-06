// Studio de documents — fabrique d'éléments partagée par les panneaux du
// rail (étape 6). Un seul compteur module-level partagé par tous les
// panneaux : le dupliquer par fichier créerait un compteur par panneau,
// ce qui rouvre un (faible mais réel) risque de collision d'id entre deux
// éléments ajoutés à la même milliseconde depuis deux panneaux différents.

import { captionHtml, type DocumentElement, type DocumentShapeElement, type DocumentTextElement } from "@/lib/documents/content";

let elementCounter = 0;

export function newElementId(prefix: string): string {
  elementCounter += 1;
  return `${prefix}-${Date.now()}-${elementCounter}`;
}

export const DEFAULT_POSITION = { x: 60, y: 60 };

export function variableTextElement(token: string, x: number, y: number, width = 220, height = 28): DocumentTextElement {
  return { id: newElementId("text"), type: "text", x, y, width, height, rotation: 0, html: "", variableBinding: token };
}

export function captionElement(x: number, y: number, width: number, label: string): DocumentTextElement {
  return { id: newElementId("caption"), type: "text", x, y, width, height: 14, rotation: 0, html: captionHtml(label) };
}

/** Légende + valeur liée à une variable réelle — le même mécanisme que les modèles seedés (voir prisma/seed-document-templates.ts). */
export function fieldElements(x: number, y: number, width: number, label: string, token: string, height = 20): DocumentElement[] {
  return [captionElement(x, y, width, label), variableTextElement(token, x, y + 15, width, height)];
}

export function rectElement(x: number, y: number, width: number, height: number, fill: string, stroke: string): DocumentShapeElement {
  return { id: newElementId("shape"), type: "shape", shape: "rect", x, y, width, height, rotation: 0, fill, stroke };
}
