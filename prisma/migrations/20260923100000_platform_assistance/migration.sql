-- Multi-comptes, phase 7 : super-administration.
--
-- Un compte de plateforme peut voir tous les cabinets et assister un
-- professionnel en ouvrant une session à son nom. Chaque assistance est
-- courte, motivée, distincte des sessions du professionnel, et chaque action
-- faite pendant ce temps est attribuée à celui qui assiste.

-- Le rôle de plateforme. Jamais modifié par un écran : il est synchronisé au
-- démarrage depuis PLATFORM_ADMIN_EMAILS (src/lib/platform/grants.ts).
ALTER TABLE "User" ADD COLUMN "platformAdmin" BOOLEAN NOT NULL DEFAULT false;

-- Session d'assistance.
ALTER TABLE "Session"
  ADD COLUMN "impersonatorId"   TEXT,
  ADD COLUMN "assistanceReason" TEXT,
  ADD COLUMN "returnSessionId"  TEXT;
CREATE INDEX "Session_impersonatorId_idx" ON "Session"("impersonatorId");
ALTER TABLE "Session" ADD CONSTRAINT "Session_impersonatorId_fkey"
  FOREIGN KEY ("impersonatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Qui a réellement agi, pendant une assistance.
ALTER TABLE "AuditLog" ADD COLUMN "impersonatorId" TEXT;
CREATE INDEX "AuditLog_impersonatorId_idx" ON "AuditLog"("impersonatorId");
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_impersonatorId_fkey"
  FOREIGN KEY ("impersonatorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANCE_STARTED';
ALTER TYPE "AuditAction" ADD VALUE 'ASSISTANCE_ENDED';
