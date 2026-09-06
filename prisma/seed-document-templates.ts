import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { DocumentContent, DocumentElement, DocumentShapeElement, DocumentTextElement } from "../src/lib/documents/content";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Modèles fournis par Animéo (Studio de documents, étapes 3-4-7) — script
 * autonome (comme geocode-clients.ts, geocode-business-profile.ts), jamais
 * importé par l'app. Ré-exécutable sans effet de bord : un modèle "isBuiltIn"
 * n'est jamais modifiable depuis l'app (StudioDocumentTemplate.isBuiltIn,
 * voir schema.prisma), donc son contenu est entièrement piloté par ce
 * fichier — le script met à jour le contentJson d'un modèle existant du
 * même nom plutôt que de l'ignorer, pour que la base reste synchronisée
 * avec le code après un changement de layout (pas de contrainte unique sur
 * `name`, un check-then-create-ou-update explicite est donc plus sûr qu'un
 * upsert Prisma ici).
 */

const PAGE_WIDTH = 794;
const MARGIN = 32;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2; // 730

let idCounter = 0;
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

function textEl(x: number, y: number, width: number, height: number, html: string, variableBinding?: string): DocumentTextElement {
  return { id: nextId("text"), type: "text", x, y, width, height, rotation: 0, html, variableBinding };
}

function rectEl(x: number, y: number, width: number, height: number, fill: string, stroke: string): DocumentShapeElement {
  return { id: nextId("shape"), type: "shape", shape: "rect", x, y, width, height, rotation: 0, fill, stroke };
}

/** Légende de champ en petites majuscules au-dessus de la valeur — le même mécanisme (style inline dans `html`) que produira la barre de formatage de l'étape 8. */
function caption(x: number, y: number, width: number, label: string): DocumentTextElement {
  return textEl(x, y, width, 14, `<p style="margin:0;font-size:9px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8a97a0">${label}</p>`);
}

function eyebrow(x: number, y: number, width: number, label: string, color: string): DocumentTextElement {
  return textEl(x, y, width, 16, `<p style="margin:0;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:${color}">${label}</p>`);
}

function sectionTitle(x: number, y: number, width: number, label: string): DocumentTextElement {
  return textEl(x, y, width, 24, `<p style="margin:0;font-size:14px;font-weight:800;color:#1f2933">${label}</p>`);
}

type FieldSpec = { label: string; token: string; height?: number };

/**
 * Carte d'identité (animal/propriétaire) : fond + bordure, un en-tête
 * accentué, puis les champs en grille 2 colonnes (légende + valeur liée à
 * une vraie variable Animéo). La hauteur est calculée à partir du nombre de
 * lignes plutôt que codée en dur, pour ne jamais désynchroniser le fond de
 * son contenu quand la liste de champs change.
 */
function infoCard(x: number, y: number, width: number, title: string, fields: FieldSpec[], accent: string): { elements: DocumentElement[]; height: number } {
  const padding = 16;
  const colGap = 16;
  const colWidth = (width - padding * 2 - colGap) / 2;
  const headerHeight = 40;
  const captionHeight = 14;
  const captionToValueGap = 1;
  const rowGap = 12;

  const rows: FieldSpec[][] = [];
  for (let i = 0; i < fields.length; i += 2) rows.push(fields.slice(i, i + 2));

  const fieldElements: DocumentElement[] = [];
  let cursorY = y + headerHeight;
  for (const row of rows) {
    // Chaque ligne prend la hauteur de son champ le plus grand (ex. l'adresse,
    // plus haute que les autres) — jamais une grille à hauteur de ligne fixe
    // qui ferait déborder un champ plus grand hors de la carte.
    const rowValueHeight = Math.max(...row.map((field) => field.height ?? 20));
    row.forEach((field, col) => {
      const fx = x + padding + col * (colWidth + colGap);
      fieldElements.push(caption(fx, cursorY, colWidth, field.label));
      fieldElements.push(textEl(fx, cursorY + captionHeight + captionToValueGap, colWidth, field.height ?? 20, "", field.token));
    });
    cursorY += captionHeight + captionToValueGap + rowValueHeight + rowGap;
  }

  const height = cursorY - y - rowGap + padding;
  const elements: DocumentElement[] = [
    rectEl(x, y, width, height, "#fbfcfc", "#e5eceb"),
    rectEl(x, y, width, 4, accent, accent),
    eyebrow(x + padding, y + 16, width - padding * 2, title, accent),
    ...fieldElements,
  ];

  return { elements, height };
}

function headerBand(accentSoft: string): DocumentElement[] {
  return [
    rectEl(0, 0, PAGE_WIDTH, 104, accentSoft, accentSoft),
    textEl(MARGIN, 34, 440, 34, `<p style="margin:0;font-size:20px;font-weight:800;color:#1f2933"></p>`, "professional.company"),
  ];
}

function footerBand(y: number): DocumentElement[] {
  return [
    rectEl(0, y, PAGE_WIDTH, 1, "#e5eceb", "#e5eceb"),
    caption(MARGIN, y + 16, 240, "Téléphone du cabinet"),
    textEl(MARGIN, y + 31, 240, 18, "", "professional.phone"),
    caption(MARGIN + 260, y + 16, 240, "Email du cabinet"),
    textEl(MARGIN + 260, y + 31, 240, 18, "", "professional.email"),
    caption(MARGIN + 520, y + 16, 210, "Adresse du cabinet"),
    textEl(MARGIN + 520, y + 31, 210, 18, "", "professional.address"),
  ];
}

const ANIMAL_FIELDS: FieldSpec[] = [
  { label: "Nom", token: "animal.name" },
  { label: "Espèce", token: "animal.species" },
  { label: "Race", token: "animal.breed" },
  { label: "Sexe", token: "animal.sex" },
  { label: "Poids", token: "animal.weight" },
  { label: "Date de naissance", token: "animal.birthDate" },
];

const OWNER_FIELDS: FieldSpec[] = [
  { label: "Prénom", token: "client.firstName" },
  { label: "Nom", token: "client.lastName" },
  { label: "Téléphone", token: "client.phone" },
  { label: "Email", token: "client.email" },
  { label: "Adresse", token: "client.address", height: 44 },
];

/**
 * Gabarit commun aux comptes rendus "classiques" (identique quel que soit
 * l'accent/l'espèce) : bandeau + titre, cartes animal/propriétaire, motif,
 * observations, recommandations, pied de page. `dogDiagram` insère le
 * schéma à la place d'une partie des observations (voir dogContent()).
 */
function consultationTemplate(accent: string, accentSoft: string, title: string, dogDiagram: boolean): DocumentContent {
  idCounter = 0;
  const elements: DocumentElement[] = [
    ...headerBand(accentSoft),
    sectionTitle(MARGIN, 122, 500, title),

    ...infoCard(MARGIN, 176, 350, "Informations sur l'animal", ANIMAL_FIELDS, accent).elements,
    ...infoCard(MARGIN + 350 + 24, 176, CONTENT_WIDTH - 350 - 24, "Propriétaire", OWNER_FIELDS, accent).elements,

    sectionTitle(MARGIN, 390, 400, "Motif de consultation"),
    textEl(MARGIN, 418, CONTENT_WIDTH, 70, "<p></p>"),
  ];

  if (dogDiagram) {
    elements.push(
      sectionTitle(MARGIN, 504, 400, "Schéma et zones travaillées"),
      { id: nextId("diagram"), type: "diagram", x: MARGIN, y: 534, width: 380, height: 250, rotation: 0, species: "dog", view: "profile-left", markers: [], showLegend: true },
      sectionTitle(MARGIN + 380 + 24, 504, 300, "Observations"),
      textEl(MARGIN + 380 + 24, 532, CONTENT_WIDTH - 380 - 24, 250, "<p></p>"),
      sectionTitle(MARGIN, 810, 400, "Recommandations"),
      textEl(MARGIN, 838, CONTENT_WIDTH, 130, "<p></p>"),
    );
  } else {
    elements.push(
      sectionTitle(MARGIN, 504, 400, "Observations"),
      textEl(MARGIN, 532, CONTENT_WIDTH, 160, "<p></p>"),
      sectionTitle(MARGIN, 710, 400, "Recommandations"),
      textEl(MARGIN, 738, CONTENT_WIDTH, 140, "<p></p>"),
    );
  }

  elements.push(...footerBand(1040));

  return { formatVersion: 1, pageSize: "A4_PORTRAIT", pages: [{ id: "page-1", elements }] };
}

/**
 * "Séance de suivi" : document délibérément plus court, pour une visite de
 * contrôle plutôt qu'une consultation initiale complète — identité
 * combinée sur une ligne (pas deux cartes pleine hauteur), l'essentiel du
 * document est l'évolution constatée, pas la ressaisie des informations
 * déjà connues.
 */
function followUpTemplate(accent: string, accentSoft: string): DocumentContent {
  idCounter = 0;
  const elements: DocumentElement[] = [
    ...headerBand(accentSoft),
    sectionTitle(MARGIN, 122, 500, "Séance de suivi"),

    rectEl(MARGIN, 172, CONTENT_WIDTH, 64, "#fbfcfc", "#e5eceb"),
    caption(MARGIN + 16, 186, 200, "Animal"),
    textEl(MARGIN + 16, 201, 200, 20, "", "animal.name"),
    caption(MARGIN + 232, 186, 200, "Propriétaire"),
    textEl(MARGIN + 232, 201, 200, 20, "", "client.lastName"),
    caption(MARGIN + 448, 186, 220, "Date du rendez-vous"),
    textEl(MARGIN + 448, 201, 220, 20, "", "appointment.date"),

    sectionTitle(MARGIN, 264, 500, "Évolution depuis la dernière séance"),
    textEl(MARGIN, 292, CONTENT_WIDTH, 140, "<p></p>"),

    sectionTitle(MARGIN, 456, 500, "Ajustements réalisés aujourd'hui"),
    textEl(MARGIN, 484, CONTENT_WIDTH, 140, "<p></p>"),

    sectionTitle(MARGIN, 648, 500, "Recommandations pour la suite"),
    textEl(MARGIN, 676, CONTENT_WIDTH, 140, "<p></p>"),

    ...footerBand(1040),
  ];

  return { formatVersion: 1, pageSize: "A4_PORTRAIT", pages: [{ id: "page-1", elements }] };
}

const TEAL = { accent: "#2f7a6e", soft: "#e4f5ef" };
const AMBER = { accent: "#b9762e", soft: "#fbeee0" };
const VIOLET = { accent: "#7a5aa8", soft: "#f1ecf9" };
const BLUE = { accent: "#3a5f8a", soft: "#e8eff6" };

const templates: { name: string; species: string | null; content: DocumentContent }[] = [
  { name: "Compte rendu classique", species: null, content: consultationTemplate(TEAL.accent, TEAL.soft, "Compte rendu de consultation", false) },
  { name: "Compte rendu chien", species: "Chien", content: consultationTemplate(AMBER.accent, AMBER.soft, "Compte rendu de consultation", true) },
  { name: "Compte rendu chat", species: "Chat", content: consultationTemplate(VIOLET.accent, VIOLET.soft, "Compte rendu de consultation", false) },
  { name: "Compte rendu équin", species: "Cheval", content: consultationTemplate(BLUE.accent, BLUE.soft, "Compte rendu de consultation", false) },
  { name: "Séance de suivi", species: null, content: followUpTemplate(TEAL.accent, TEAL.soft) },
];

async function main() {
  let created = 0;
  let updated = 0;
  for (const template of templates) {
    const existing = await prisma.studioDocumentTemplate.findFirst({ where: { name: template.name, isBuiltIn: true } });
    if (existing) {
      await prisma.studioDocumentTemplate.update({ where: { id: existing.id }, data: { contentJson: template.content } });
      updated += 1;
      console.log(`Mis à jour : « ${template.name} ».`);
      continue;
    }
    await prisma.studioDocumentTemplate.create({
      data: { name: template.name, species: template.species, isBuiltIn: true, contentJson: template.content },
    });
    created += 1;
    console.log(`Créé : « ${template.name} ».`);
  }
  console.log(`Terminé : ${created} modèle(s) créé(s), ${updated} mis à jour.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
