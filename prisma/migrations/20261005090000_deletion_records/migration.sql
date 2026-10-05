-- Suppression d'un espace professionnel (chantier C9, phase 3).
--
-- DeletionRecord : la seule trace qui survit à l'effacement d'un espace.
-- Aucune donnée personnelle : des empreintes (identifiant de l'espace,
-- lien de réservation), des dates, une catégorie de motif, l'identifiant du
-- compte de plateforme qui a demandé, et des nombres de lignes. Sert de
-- preuve, de liste à rejouer après une restauration de sauvegarde, et de
-- quarantaine du lien de réservation (6 mois).

-- CreateEnum
CREATE TYPE "DeletionReason" AS ENUM ('PROFESSIONAL_REQUEST', 'CONTRACT_END', 'FRAUD', 'OTHER');

-- CreateTable
CREATE TABLE "DeletionRecord" (
    "id" TEXT NOT NULL,
    "organizationHash" TEXT NOT NULL,
    "slugHash" TEXT,
    "reason" "DeletionReason" NOT NULL,
    "requestedAt" TIMESTAMP(3) NOT NULL,
    "requestedByUserId" TEXT,
    "purgedAt" TIMESTAMP(3),
    "rowCounts" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeletionRecord_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DeletionRecord_organizationHash_key" ON "DeletionRecord"("organizationHash");

-- CreateIndex
CREATE INDEX "DeletionRecord_slugHash_idx" ON "DeletionRecord"("slugHash");

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_DELETION_SCHEDULED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_DELETION_CANCELLED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_EXPORTED';
