-- Multi-comptes, phase 4 : invitation et onboarding.
--
-- L'inscription n'est pas publique : un compte de plateforme envoie une
-- invitation, dont le lien crée le cabinet et son administrateur. Le cabinet
-- se configure ensuite (onboarding) avant d'ouvrir sa page de réservation.

CREATE TABLE "Invitation" (
  "id"               TEXT         NOT NULL,
  "email"            TEXT         NOT NULL,
  "organizationName" TEXT         NOT NULL,
  "tokenHash"        TEXT         NOT NULL,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt"        TIMESTAMP(3) NOT NULL,
  "usedAt"           TIMESTAMP(3),
  "revokedAt"        TIMESTAMP(3),
  "createdById"      TEXT,
  "organizationId"   TEXT,
  CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Fin de la configuration initiale. Les cabinets existants sont déjà en
-- service : ils sont considérés comme configurés depuis leur création.
ALTER TABLE "Organization" ADD COLUMN "onboardedAt" TIMESTAMP(3);
UPDATE "Organization" SET "onboardedAt" = "createdAt";

ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_SENT';
ALTER TYPE "AuditAction" ADD VALUE 'INVITATION_REVOKED';
ALTER TYPE "AuditAction" ADD VALUE 'ORGANIZATION_CREATED';
ALTER TYPE "AuditAction" ADD VALUE 'ONBOARDING_COMPLETED';
