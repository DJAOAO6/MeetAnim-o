-- Validation du numéro RNA par la plateforme (chantier C4, phase 5).

-- Date de la dernière demande de vérification, pour la liste de la plateforme.
ALTER TABLE "Organization" ADD COLUMN "verificationRequestedAt" TIMESTAMP(3);

-- Les demandes déjà en attente datent de la fin de leur configuration.
UPDATE "Organization" SET "verificationRequestedAt" = "onboardedAt"
WHERE "verificationStatus" IN ('PENDING', 'REJECTED') AND "verificationRequestedAt" IS NULL;

ALTER TYPE "AuditAction" ADD VALUE 'VERIFICATION_APPROVED';
ALTER TYPE "AuditAction" ADD VALUE 'VERIFICATION_REJECTED';
