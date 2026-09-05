import { config } from "dotenv";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { DocumentContent } from "../src/lib/documents/content";

config({ path: ".env.local" });

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

/**
 * Modèles fournis par Animéo (Studio de documents, étapes 3-4) — script
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

function classicContent(): DocumentContent {
  return {
    formatVersion: 1,
    pageSize: "A4_PORTRAIT",
    pages: [
      {
        id: "page-1",
        elements: [
          { id: "el-header-bg", type: "shape", shape: "rect", x: 0, y: 0, width: 794, height: 90, rotation: 0, fill: "#e4f5ef", stroke: "#e4f5ef" },
          { id: "el-company", type: "text", x: 32, y: 24, width: 400, height: 32, rotation: 0, html: "", variableBinding: "professional.company" },
          { id: "el-title", type: "text", x: 32, y: 120, width: 500, height: 44, rotation: 0, html: "<p><strong>Compte rendu de consultation</strong></p>" },

          { id: "el-animal-bg", type: "shape", shape: "rect", x: 32, y: 180, width: 340, height: 150, rotation: 0, fill: "#f7faf9", stroke: "#dce8e5" },
          { id: "el-animal-name", type: "text", x: 44, y: 190, width: 316, height: 26, rotation: 0, html: "", variableBinding: "animal.name" },
          { id: "el-animal-species", type: "text", x: 44, y: 220, width: 316, height: 22, rotation: 0, html: "", variableBinding: "animal.species" },
          { id: "el-animal-breed", type: "text", x: 44, y: 244, width: 316, height: 22, rotation: 0, html: "", variableBinding: "animal.breed" },
          { id: "el-animal-sex", type: "text", x: 44, y: 272, width: 152, height: 22, rotation: 0, html: "", variableBinding: "animal.sex" },
          { id: "el-animal-weight", type: "text", x: 208, y: 272, width: 152, height: 22, rotation: 0, html: "", variableBinding: "animal.weight" },

          { id: "el-owner-bg", type: "shape", shape: "rect", x: 422, y: 180, width: 340, height: 150, rotation: 0, fill: "#f7faf9", stroke: "#dce8e5" },
          { id: "el-owner-first", type: "text", x: 434, y: 190, width: 152, height: 24, rotation: 0, html: "", variableBinding: "client.firstName" },
          { id: "el-owner-last", type: "text", x: 598, y: 190, width: 152, height: 24, rotation: 0, html: "", variableBinding: "client.lastName" },
          { id: "el-owner-phone", type: "text", x: 434, y: 222, width: 316, height: 22, rotation: 0, html: "", variableBinding: "client.phone" },
          { id: "el-owner-email", type: "text", x: 434, y: 246, width: 316, height: 22, rotation: 0, html: "", variableBinding: "client.email" },
          { id: "el-owner-address", type: "text", x: 434, y: 270, width: 316, height: 44, rotation: 0, html: "", variableBinding: "client.address" },

          { id: "el-reason", type: "text", x: 32, y: 360, width: 730, height: 90, rotation: 0, html: "<p><strong>Motif de consultation</strong></p><p></p>" },
          { id: "el-observations", type: "text", x: 32, y: 470, width: 730, height: 160, rotation: 0, html: "<p><strong>Observations</strong></p><p></p>" },
          { id: "el-recommendations", type: "text", x: 32, y: 650, width: 730, height: 120, rotation: 0, html: "<p><strong>Recommandations</strong></p><p></p>" },
        ],
      },
    ],
  };
}

function dogContent(): DocumentContent {
  const base = classicContent();
  const page = base.pages[0];
  // Remplace le bloc "Observations" par le schéma animalier (étape 4) :
  // silhouette + repères + légende à gauche, observations libres réduites
  // à droite, recommandations décalées d'autant plus bas.
  const elements = page.elements
    .filter((element) => element.id !== "el-observations")
    .map((element) => (element.id === "el-recommendations" ? { ...element, y: 744 } : element));
  elements.push(
    { id: "el-diagram", type: "diagram", x: 32, y: 470, width: 380, height: 260, rotation: 0, species: "dog", view: "profile-left", markers: [], showLegend: true },
    { id: "el-observations-short", type: "text", x: 430, y: 470, width: 332, height: 260, rotation: 0, html: "<p><strong>Observations</strong></p><p></p>" },
  );
  return { ...base, pages: [{ ...page, elements }] };
}

const templates: { name: string; species: string | null; content: DocumentContent }[] = [
  { name: "Compte rendu classique", species: null, content: classicContent() },
  { name: "Compte rendu chien", species: "Chien", content: dogContent() },
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
