"use server";

import { moduleOpen, requireModule } from "@/lib/module-access";
import { revalidatePath } from "next/cache";
import { currentDb } from "@/lib/organization";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { formatFrenchDate } from "@/lib/format";
import { getBusinessProfile } from "@/lib/business-profile-actions";
import { buildLayoutSketch, createEmptyDocumentContent, type DocumentContent, type DocumentPageSize } from "@/lib/documents/content";
import type { DocumentVariableContext } from "@/lib/documents/variables";
import { getMarkerPresets } from "@/lib/documents/marker-presets-actions";
import { sanitizeDocumentContent } from "@/lib/documents/sanitize-server";
import { Prisma } from "@/generated/prisma/client";
import type { StudioDocumentDetail, StudioDocumentStatus, StudioDocumentSummary, StudioDocumentTemplateSummary } from "@/data/documents";

const DOCUMENTS_PATH = "/dashboard/documents";

function mapStatus(status: "DRAFT" | "FINALIZED"): StudioDocumentStatus {
  return status === "FINALIZED" ? "Finalisé" : "Brouillon";
}

const summaryInclude = {
  client: { select: { firstName: true, lastName: true } },
  animal: { select: { name: true } },
} as const;

type SummaryRow = Prisma.StudioDocumentGetPayload<{ include: typeof summaryInclude }>;

function mapSummary(row: SummaryRow): StudioDocumentSummary {
  return {
    id: row.id,
    title: row.title,
    status: mapStatus(row.status),
    clientName: row.client ? `${row.client.firstName} ${row.client.lastName}` : null,
    animalName: row.animal?.name ?? null,
    updatedAt: formatFrenchDate(row.updatedAt),
    thumbnail: row.thumbnail,
  };
}

export async function getDocuments(): Promise<StudioDocumentSummary[]> {
  await requireModule("DOCUMENTS");
  await requireUser();
  const db = await currentDb();
  const rows = await db.studioDocument.findMany({ orderBy: { updatedAt: "desc" }, include: summaryInclude });
  return rows.map(mapSummary);
}

export async function getDocumentsForAnimal(animalId: string): Promise<StudioDocumentSummary[]> {
  if (!(await moduleOpen("DOCUMENTS"))) return [];
  await requireUser();
  const db = await currentDb();
  const rows = await db.studioDocument.findMany({ where: { animalId }, orderBy: { updatedAt: "desc" }, include: summaryInclude });
  return rows.map(mapSummary);
}

/**
 * Un rendez-vous n'a jamais plus d'un compte rendu (contrainte unique sur
 * appointmentId) — utilisé par "Créer le compte rendu" (appointment-summary.tsx)
 * pour rouvrir le document existant plutôt que d'échouer sur le P2002 d'une
 * seconde création.
 */
export async function getDocumentIdForAppointment(appointmentId: string): Promise<string | null> {
  if (!(await moduleOpen("DOCUMENTS"))) return null;
  await requireUser();
  const db = await currentDb();
  const row = await db.studioDocument.findUnique({ where: { appointmentId }, select: { id: true } });
  return row?.id ?? null;
}

export async function getDocumentTemplates(): Promise<StudioDocumentTemplateSummary[]> {
  if (!(await moduleOpen("DOCUMENTS"))) return [];
  await requireUser();
  const db = await currentDb();
  const rows = await db.studioDocumentTemplate.findMany({ orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }] });
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    species: row.species,
    thumbnail: row.thumbnail,
    isBuiltIn: row.isBuiltIn,
    layoutSketch: buildLayoutSketch(row.contentJson as unknown as DocumentContent),
  }));
}

/**
 * Contenu complet d'un modèle (html/variableBinding réels) — jamais exposé
 * par getDocumentTemplates()/layoutSketch (géométrie seule, pour la
 * galerie). Utilisé uniquement quand l'utilisateur choisit explicitement
 * d'insérer un modèle (création de document, ou "Modèles" du rail —
 * étape 10), jamais dans une liste.
 */
export async function getDocumentTemplateContent(templateId: string): Promise<DocumentContent | null> {
  await requireModule("DOCUMENTS");
  await requireUser();
  const db = await currentDb();
  const row = await db.studioDocumentTemplate.findUnique({ where: { id: templateId }, select: { contentJson: true } });
  if (!row) return null;
  return row.contentJson as unknown as DocumentContent;
}

const detailInclude = {
  client: { select: { firstName: true, lastName: true, phone: true, email: true, address: true } },
  animal: { select: { name: true, species: true, breed: true, sex: true, weight: true, birthDate: true } },
  appointment: { select: { date: true, start: true, serviceName: true, location: true } },
} as const;

/**
 * Contexte de résolution des variables (src/lib/documents/variables.ts) —
 * calculé une fois côté serveur à partir des vraies fiches liées au
 * document, jamais recalculé dans le navigateur. `professional` vient
 * toujours du même profil (singleton, getBusinessProfile) ; les trois
 * autres sont absents si le document n'est lié à aucune fiche.
 */
async function buildVariableContext(row: Prisma.StudioDocumentGetPayload<{ include: typeof detailInclude }>): Promise<DocumentVariableContext> {
  const professional = await getBusinessProfile();
  return {
    professional: { company: professional.company, phone: professional.phone, email: professional.email, address: professional.address },
    client: row.client,
    animal: row.animal ? { ...row.animal, birthDate: row.animal.birthDate ? formatFrenchDate(row.animal.birthDate) : null } : null,
    appointment: row.appointment ? { ...row.appointment, date: formatFrenchDate(row.appointment.date) } : null,
  };
}

export async function getDocument(id: string): Promise<StudioDocumentDetail | null> {
  await requireModule("DOCUMENTS");
  await requireUser();
  const db = await currentDb();
  const row = await db.studioDocument.findUnique({ where: { id }, include: { ...summaryInclude, ...detailInclude } });
  if (!row) return null;
  const [variableContext, markerPresets] = await Promise.all([buildVariableContext(row), getMarkerPresets()]);
  return {
    ...mapSummary(row),
    clientId: row.clientId,
    animalId: row.animalId,
    appointmentId: row.appointmentId,
    templateId: row.templateId,
    content: row.contentJson as unknown as DocumentContent,
    pdfBase64: row.pdfBase64,
    variableContext,
    markerPresets,
  };
}

/**
 * P2002 ne peut venir ici que de la contrainte unique sur `appointmentId` —
 * un rendez-vous n'a jamais plus d'un compte rendu, voir le commentaire sur
 * StudioDocument.appointmentId dans schema.prisma.
 */
function isDuplicateAppointmentDocument(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export type CreateDocumentInput = {
  title: string;
  clientId?: string;
  animalId?: string;
  appointmentId?: string;
  templateId?: string;
  // Sélecteur de format (étape 26) — ignoré si templateId est fourni : les
  // modèles sont conçus pour A4, leur propre pageSize stocké l'emporte
  // toujours (voir documents-list.tsx, qui désactive déjà la galerie de
  // modèles quand un format non-A4 est choisi, donc ce cas ne devrait pas
  // se produire en pratique — gardé simple ici plutôt que rejeté en erreur).
  pageSize?: DocumentPageSize;
};

export type DocumentActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createDocumentAction(input: CreateDocumentInput): Promise<DocumentActionResult> {
  await requireModule("DOCUMENTS");
  const user = await requireUser();
  const db = await currentDb();

  let content: DocumentContent = createEmptyDocumentContent(input.pageSize);
  if (input.templateId) {
    const template = await db.studioDocumentTemplate.findUnique({ where: { id: input.templateId }, select: { contentJson: true } });
    if (template) content = template.contentJson as unknown as DocumentContent;
  }
  // Un modèle peut avoir été créé par n'importe quel compte : il passe par le
  // même filtre qu'un document.
  content = sanitizeDocumentContent(content);

  let created;
  try {
    created = await db.studioDocument.create({
      data: {
        title: input.title.trim() || "Document sans titre",
        clientId: input.clientId ?? null,
        animalId: input.animalId ?? null,
        appointmentId: input.appointmentId ?? null,
        templateId: input.templateId ?? null,
        createdByUserId: user.id,
        contentJson: content as unknown as Prisma.InputJsonValue,
      },
    });
  } catch (error) {
    if (isDuplicateAppointmentDocument(error)) {
      return { ok: false, error: "Un compte rendu existe déjà pour ce rendez-vous." };
    }
    throw error;
  }

  await logAudit({ userId: user.id, action: "DOCUMENT_CREATED", entityType: "StudioDocument", entityId: created.id });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true, id: created.id };
}

export type SaveDocumentInput = {
  title?: string;
  content: DocumentContent;
  thumbnail?: string;
};

/**
 * Autosave — jamais de vérification de permission au-delà de la session :
 * un brouillon reste modifiable par tout le personnel, même logique que
 * saveAppointmentAction (aucun compte rendu n'appartient exclusivement à
 * son créateur, voir le commentaire sur StudioDocument dans schema.prisma).
 */
/**
 * Forme minimale d'un contenu de document. Le détail des éléments reste
 * libre (formes, images, schémas évoluent souvent), mais la structure qui
 * porte le HTML doit être celle attendue : sinon l'assainissement pourrait
 * être contourné par un contenu mal formé.
 */
function isDocumentContent(value: unknown): value is DocumentContent {
  if (!value || typeof value !== "object") return false;
  const content = value as { pages?: unknown };
  return Array.isArray(content.pages) && content.pages.every((page) =>
    page && typeof page === "object" && Array.isArray((page as { elements?: unknown }).elements)
    && (page as { elements: unknown[] }).elements.every((element) => element && typeof element === "object" && typeof (element as { type?: unknown }).type === "string"),
  );
}

export async function saveDocumentAction(id: string, input: SaveDocumentInput): Promise<DocumentActionResult> {
  await requireModule("DOCUMENTS");
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };
  const db = await currentDb();

  const existing = await db.studioDocument.findUnique({ where: { id }, select: { status: true, createdByUserId: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };
  if (existing.status === "FINALIZED") return { ok: false, error: "Ce document est finalisé — dupliquez-le pour le modifier." };
  // Un compte rendu est un dossier clinique : seul son auteur le modifie,
  // ou un compte qui gère les documents (l'administrateur, d'office). Sans
  // cette règle, n'importe quel compte — secrétariat compris — pouvait
  // réécrire le document d'un autre.
  if (existing.createdByUserId !== user.id && !hasPermission(user, "MANAGE_DOCUMENTS")) {
    return { ok: false, error: "Seul l'auteur de ce document peut le modifier. Dupliquez-le pour en faire votre version." };
  }
  if (!isDocumentContent(input.content)) return { ok: false, error: "Contenu de document invalide." };

  await db.studioDocument.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      contentJson: sanitizeDocumentContent(input.content) as unknown as Prisma.InputJsonValue,
      thumbnail: input.thumbnail,
    },
  });

  return { ok: true, id };
}

export type FinalizeDocumentInput = {
  pdfBase64: string;
  thumbnail?: string;
};

export async function finalizeDocumentAction(id: string, input: FinalizeDocumentInput): Promise<DocumentActionResult> {
  await requireModule("DOCUMENTS");
  const user = await requireUser();
  const db = await currentDb();

  const existing = await db.studioDocument.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };
  if (existing.status === "FINALIZED") return { ok: false, error: "Ce document est déjà finalisé." };

  await db.studioDocument.update({
    where: { id },
    data: {
      status: "FINALIZED",
      pdfBase64: input.pdfBase64,
      thumbnail: input.thumbnail,
      finalizedAt: new Date(),
    },
  });

  await logAudit({ userId: user.id, action: "DOCUMENT_FINALIZED", entityType: "StudioDocument", entityId: id });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true, id };
}

/**
 * Un document finalisé ne se modifie jamais en place — dupliquer crée un
 * nouveau brouillon indépendant, jamais rattaché au même rendez-vous
 * (contrainte unique sur appointmentId, voir schema.prisma) ni déjà
 * finalisé (repart de DRAFT, sans PDF/miniature à régénérer).
 */
export async function duplicateDocumentAction(id: string): Promise<DocumentActionResult> {
  await requireModule("DOCUMENTS");
  const user = await requireUser();
  const db = await currentDb();

  const source = await db.studioDocument.findUnique({ where: { id } });
  if (!source) return { ok: false, error: "Ce document n'existe plus." };

  const created = await db.studioDocument.create({
    data: {
      title: `${source.title} (copie)`,
      clientId: source.clientId,
      animalId: source.animalId,
      appointmentId: null,
      templateId: source.templateId,
      createdByUserId: user.id,
      // Un document ancien a pu être enregistré avant le filtre : la copie,
      // elle, repart propre.
      contentJson: sanitizeDocumentContent(source.contentJson as unknown as DocumentContent) as unknown as Prisma.InputJsonValue,
    },
  });

  await logAudit({ userId: user.id, action: "DOCUMENT_CREATED", entityType: "StudioDocument", entityId: created.id, metadata: { duplicatedFrom: id } });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true, id: created.id };
}

export type DeleteDocumentResult = { ok: true } | { ok: false; error: string };

export async function deleteDocumentAction(id: string): Promise<DeleteDocumentResult> {
  await requireModule("DOCUMENTS");
  const user = await requireUser();
  const db = await currentDb();
  if (!hasPermission(user, "MANAGE_DOCUMENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer des documents." };
  }

  const existing = await db.studioDocument.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };

  await db.studioDocument.delete({ where: { id } });
  await logAudit({ userId: user.id, action: "DOCUMENT_DELETED", entityType: "StudioDocument", entityId: id });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true };
}
