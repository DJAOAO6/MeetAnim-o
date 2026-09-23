-- Modules d'un espace professionnel : ce que la plateforme lui ouvre en plus
-- du socle (src/lib/modules.ts). Un nouvel espace n'a que le socle ; la
-- super-administration active le reste.
--
-- Les espaces existants gardent tout ce dont ils se servent déjà : ils
-- reçoivent l'ensemble des modules.

ALTER TABLE "Organization" ADD COLUMN "modules" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

UPDATE "Organization" SET "modules" = ARRAY['TOURS', 'REMINDERS', 'DOCUMENTS', 'STATISTICS', 'CALENDAR_SYNC', 'CLIENT_IMPORT', 'TEAM', 'PUBLIC_PAGE']::TEXT[];

ALTER TYPE "AuditAction" ADD VALUE 'MODULES_CHANGED';
