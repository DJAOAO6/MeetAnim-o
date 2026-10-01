-- Suspension d'un espace professionnel (chantier C9, phase 1).
-- suspendedByUserId : simple identifiant, sans clé étrangère — supprimer le
-- compte de plateforme qui a suspendu ne doit ni échouer ni lever la
-- suspension. deletionScheduledFor sert à la suppression programmée (phase 3).
ALTER TABLE "Organization" ADD COLUMN "suspendedAt" TIMESTAMP(3),
ADD COLUMN "suspendedReason" TEXT,
ADD COLUMN "suspendedByUserId" TEXT,
ADD COLUMN "deletionScheduledFor" TIMESTAMP(3);

-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_SUSPENDED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_REACTIVATED';
