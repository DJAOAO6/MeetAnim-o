-- Archivage des clients (chantier C5, phase 3) : sortir une fiche de la
-- liste courante sans la supprimer.

ALTER TABLE "Client" ADD COLUMN "archivedAt" TIMESTAMP(3);

CREATE INDEX "Client_organizationId_archivedAt_idx" ON "Client"("organizationId", "archivedAt");

ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_ARCHIVED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_RESTORED';
