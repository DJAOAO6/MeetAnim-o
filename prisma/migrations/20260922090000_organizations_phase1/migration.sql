-- Multi-comptes, phase 1 : fondations.
--
-- Chaque donnée métier appartient désormais à un « espace professionnel »
-- (Organization). Cette migration ne change aucun comportement : elle donne
-- un propriétaire à ce qui existe, et prépare le cloisonnement (phase 2).
--
-- La valeur par défaut 'org-1002-pattes' est TEMPORAIRE. Elle permet au code
-- actuel — qui ne connaît pas encore les espaces — de continuer à écrire sans
-- rien casser entre les phases 1 et 2. Elle disparaît à la fin de la phase 2,
-- quand toutes les écritures passeront par le client Prisma cloisonné :
-- ALTER TABLE ... ALTER COLUMN "organizationId" DROP DEFAULT.

CREATE TABLE "Organization" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

-- Le premier espace reprend le nom de l'activité déjà enregistrée, pour que
-- le professionnel se reconnaisse. Identifiant fixe : c'est lui que porte la
-- valeur par défaut ci-dessus.
INSERT INTO "Organization" ("id", "name", "createdAt", "updatedAt")
SELECT 'org-1002-pattes',
       COALESCE(NULLIF(TRIM((SELECT "company" FROM "BusinessProfile" ORDER BY "updatedAt" LIMIT 1)), ''), '1002 Pattes'),
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM "Organization" WHERE "id" = 'org-1002-pattes');

-- Tables métier : colonne obligatoire. Les lignes existantes reçoivent la
-- valeur par défaut, donc aucune reprise de données à faire ensuite.
ALTER TABLE "BusinessProfile"          ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Client"                   ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Animal"                   ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Consultation"             ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "AnimalDocument"           ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "StudioDocument"           ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Appointment"              ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "AppointmentCalendarEvent" ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "BlockedSlot"              ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Reminder"                 ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Zone"                     ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "City"                     ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Tour"                     ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "Service"                  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "TourRun"                  ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "TourStop"                 ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "SavedPlace"               ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';
ALTER TABLE "ClientImport"             ADD COLUMN "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes';

-- Comptes : rattachés au premier espace. La colonne reste facultative — un
-- compte de plateforme (super-administration, phase 7) n'appartient à aucun
-- cabinet.
ALTER TABLE "User" ADD COLUMN "organizationId" TEXT;
UPDATE "User" SET "organizationId" = 'org-1002-pattes' WHERE "organizationId" IS NULL;
ALTER TABLE "User" ALTER COLUMN "organizationId" SET DEFAULT 'org-1002-pattes';

-- Modèles de comptes rendus : ceux fournis avec 1002 Pattes restent sans
-- espace — communs à tous les cabinets, modifiables par aucun (décision du
-- 21 septembre 2026). Ceux écrits par un professionnel sont à lui.
ALTER TABLE "StudioDocumentTemplate" ADD COLUMN "organizationId" TEXT;
UPDATE "StudioDocumentTemplate" SET "organizationId" = 'org-1002-pattes' WHERE "isBuiltIn" = false;

-- Journal d'audit : l'action d'un compte de plateforme n'appartient à aucun
-- cabinet, d'où une colonne facultative.
ALTER TABLE "AuditLog" ADD COLUMN "organizationId" TEXT;
UPDATE "AuditLog" SET "organizationId" = 'org-1002-pattes';

-- Index : toute lecture cloisonnée filtrera d'abord sur l'espace.
CREATE INDEX "BusinessProfile_organizationId_idx"          ON "BusinessProfile"("organizationId");
CREATE INDEX "Client_organizationId_idx"                   ON "Client"("organizationId");
CREATE INDEX "Animal_organizationId_idx"                   ON "Animal"("organizationId");
CREATE INDEX "Consultation_organizationId_idx"             ON "Consultation"("organizationId");
CREATE INDEX "AnimalDocument_organizationId_idx"           ON "AnimalDocument"("organizationId");
CREATE INDEX "StudioDocument_organizationId_idx"           ON "StudioDocument"("organizationId");
CREATE INDEX "Appointment_organizationId_idx"              ON "Appointment"("organizationId");
CREATE INDEX "AppointmentCalendarEvent_organizationId_idx" ON "AppointmentCalendarEvent"("organizationId");
CREATE INDEX "BlockedSlot_organizationId_idx"              ON "BlockedSlot"("organizationId");
CREATE INDEX "Reminder_organizationId_idx"                 ON "Reminder"("organizationId");
CREATE INDEX "Zone_organizationId_idx"                     ON "Zone"("organizationId");
CREATE INDEX "City_organizationId_idx"                     ON "City"("organizationId");
CREATE INDEX "Tour_organizationId_idx"                     ON "Tour"("organizationId");
CREATE INDEX "Service_organizationId_idx"                  ON "Service"("organizationId");
CREATE INDEX "TourRun_organizationId_idx"                  ON "TourRun"("organizationId");
CREATE INDEX "TourStop_organizationId_idx"                 ON "TourStop"("organizationId");
CREATE INDEX "SavedPlace_organizationId_idx"               ON "SavedPlace"("organizationId");
CREATE INDEX "ClientImport_organizationId_idx"             ON "ClientImport"("organizationId");
CREATE INDEX "User_organizationId_idx"                     ON "User"("organizationId");
CREATE INDEX "StudioDocumentTemplate_organizationId_idx"   ON "StudioDocumentTemplate"("organizationId");
CREATE INDEX "AuditLog_organizationId_idx"                 ON "AuditLog"("organizationId");

-- Recherche d'agenda cloisonnée : l'index qui portera « les rendez-vous de
-- ce cabinet, ce jour-là ».
CREATE INDEX "Appointment_organizationId_date_start_idx" ON "Appointment"("organizationId", "date", "start");

-- Clés étrangères. RESTRICT : un espace ne se supprime pas tant qu'il porte
-- des données — une suppression en cascade effacerait un cabinet entier sur
-- un seul appel.
ALTER TABLE "BusinessProfile"          ADD CONSTRAINT "BusinessProfile_organizationId_fkey"          FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Client"                   ADD CONSTRAINT "Client_organizationId_fkey"                   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Animal"                   ADD CONSTRAINT "Animal_organizationId_fkey"                   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Consultation"             ADD CONSTRAINT "Consultation_organizationId_fkey"             FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AnimalDocument"           ADD CONSTRAINT "AnimalDocument_organizationId_fkey"           FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioDocument"           ADD CONSTRAINT "StudioDocument_organizationId_fkey"           FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Appointment"              ADD CONSTRAINT "Appointment_organizationId_fkey"              FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "BlockedSlot"              ADD CONSTRAINT "BlockedSlot_organizationId_fkey"              FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Reminder"                 ADD CONSTRAINT "Reminder_organizationId_fkey"                 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Zone"                     ADD CONSTRAINT "Zone_organizationId_fkey"                     FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "City"                     ADD CONSTRAINT "City_organizationId_fkey"                     FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Tour"                     ADD CONSTRAINT "Tour_organizationId_fkey"                     FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Service"                  ADD CONSTRAINT "Service_organizationId_fkey"                  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TourRun"                  ADD CONSTRAINT "TourRun_organizationId_fkey"                  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "TourStop"                 ADD CONSTRAINT "TourStop_organizationId_fkey"                 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SavedPlace"               ADD CONSTRAINT "SavedPlace_organizationId_fkey"               FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ClientImport"             ADD CONSTRAINT "ClientImport_organizationId_fkey"             FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "User"                     ADD CONSTRAINT "User_organizationId_fkey"                     FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StudioDocumentTemplate"   ADD CONSTRAINT "StudioDocumentTemplate_organizationId_fkey"   FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog"                 ADD CONSTRAINT "AuditLog_organizationId_fkey"                 FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
