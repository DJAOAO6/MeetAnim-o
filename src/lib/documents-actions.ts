"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/dal";
import { hasPermission } from "@/lib/auth/permissions";
import { logAudit } from "@/lib/audit";
import { formatFrenchDate } from "@/lib/format";
import { createEmptyDocumentContent, type DocumentContent } from "@/lib/documents/content";
import { Prisma } from "@/generated/prisma/client";
import type { StudioDocumentDetail, StudioDocumentStatus, StudioDocumentSummary } from "@/data/documents";

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
  await requireUser();
  const rows = await prisma.studioDocument.findMany({ orderBy: { updatedAt: "desc" }, include: summaryInclude });
  return rows.map(mapSummary);
}

export async function getDocumentsForAnimal(animalId: string): Promise<StudioDocumentSummary[]> {
  await requireUser();
  const rows = await prisma.studioDocument.findMany({ where: { animalId }, orderBy: { updatedAt: "desc" }, include: summaryInclude });
  return rows.map(mapSummary);
}

export async function getDocument(id: string): Promise<StudioDocumentDetail | null> {
  await requireUser();
  const row = await prisma.studioDocument.findUnique({ where: { id }, include: summaryInclude });
  if (!row) return null;
  return {
    ...mapSummary(row),
    clientId: row.clientId,
    animalId: row.animalId,
    appointmentId: row.appointmentId,
    templateId: row.templateId,
    content: row.contentJson as unknown as DocumentContent,
    pdfBase64: row.pdfBase64,
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
};

export type DocumentActionResult = { ok: true; id: string } | { ok: false; error: string };

export async function createDocumentAction(input: CreateDocumentInput): Promise<DocumentActionResult> {
  const user = await requireUser();

  let content: DocumentContent = createEmptyDocumentContent();
  if (input.templateId) {
    const template = await prisma.studioDocumentTemplate.findUnique({ where: { id: input.templateId }, select: { contentJson: true } });
    if (template) content = template.contentJson as unknown as DocumentContent;
  }

  let created;
  try {
    created = await prisma.studioDocument.create({
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
export async function saveDocumentAction(id: string, input: SaveDocumentInput): Promise<DocumentActionResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Session expirée, merci de vous reconnecter." };

  const existing = await prisma.studioDocument.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };
  if (existing.status === "FINALIZED") return { ok: false, error: "Ce document est finalisé — dupliquez-le pour le modifier." };

  await prisma.studioDocument.update({
    where: { id },
    data: {
      title: input.title?.trim() || undefined,
      contentJson: input.content as unknown as Prisma.InputJsonValue,
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
  const user = await requireUser();

  const existing = await prisma.studioDocument.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };
  if (existing.status === "FINALIZED") return { ok: false, error: "Ce document est déjà finalisé." };

  await prisma.studioDocument.update({
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
  const user = await requireUser();

  const source = await prisma.studioDocument.findUnique({ where: { id } });
  if (!source) return { ok: false, error: "Ce document n'existe plus." };

  const created = await prisma.studioDocument.create({
    data: {
      title: `${source.title} (copie)`,
      clientId: source.clientId,
      animalId: source.animalId,
      appointmentId: null,
      templateId: source.templateId,
      createdByUserId: user.id,
      contentJson: source.contentJson as Prisma.InputJsonValue,
    },
  });

  await logAudit({ userId: user.id, action: "DOCUMENT_CREATED", entityType: "StudioDocument", entityId: created.id, metadata: { duplicatedFrom: id } });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true, id: created.id };
}

export type DeleteDocumentResult = { ok: true } | { ok: false; error: string };

export async function deleteDocumentAction(id: string): Promise<DeleteDocumentResult> {
  const user = await requireUser();
  if (!hasPermission(user, "MANAGE_DOCUMENTS")) {
    return { ok: false, error: "Vous n'avez pas la permission de supprimer des documents." };
  }

  const existing = await prisma.studioDocument.findUnique({ where: { id }, select: { id: true } });
  if (!existing) return { ok: false, error: "Ce document n'existe plus." };

  await prisma.studioDocument.delete({ where: { id } });
  await logAudit({ userId: user.id, action: "DOCUMENT_DELETED", entityType: "StudioDocument", entityId: id });
  revalidatePath(DOCUMENTS_PATH);

  return { ok: true };
}
