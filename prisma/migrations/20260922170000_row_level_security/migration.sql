-- Multi-comptes, phase 5 : seconde barrière, dans la base elle-même.
--
-- L'application filtre déjà chaque requête sur l'espace professionnel courant
-- (src/lib/db-scope.ts). Ceci est la ceinture qui double les bretelles : même
-- si une requête échappait à ce filtre, PostgreSQL refuserait les lignes d'un
-- autre cabinet.
--
-- Comment le cabinet est-il connu de la base ? Chaque connexion ouverte par
-- l'application le déclare (`app.organization_id`, posé à l'ouverture de la
-- connexion — voir src/lib/db.ts).
--
-- FORCE : sans lui, le propriétaire des tables — et c'est sous ce compte que
-- l'application se connecte — ignorerait purement et simplement ces règles.
--
-- Une connexion qui ne déclare rien voit tout. C'est volontaire, et c'est la
-- limite actuelle : migrations, peuplement et scripts d'entretien en ont
-- besoin. La protection porte donc sur ce qui déclare un cabinet, c'est-à-dire
-- toute l'application. L'étape suivante, avant d'accueillir un cabinet
-- extérieur, est de faire tourner l'application sous un rôle dédié auquel
-- cette échappatoire serait fermée (voir docs/PLAN-MULTI-COMPTES.md).

ALTER TABLE "BusinessProfile" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BusinessProfile" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "BusinessProfile"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Client" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Client" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Client"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Animal" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Animal" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Animal"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Consultation" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Consultation" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Consultation"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "AnimalDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnimalDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "AnimalDocument"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "StudioDocument" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "StudioDocument" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "StudioDocument"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Appointment" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Appointment" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Appointment"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "AppointmentCalendarEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentCalendarEvent" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "AppointmentCalendarEvent"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "BlockedSlot" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BlockedSlot" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "BlockedSlot"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Reminder" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Reminder" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Reminder"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Zone" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Zone" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Zone"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "City" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "City" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "City"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Tour" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Tour" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Tour"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "Service" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Service" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "Service"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "TourRun" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TourRun" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "TourRun"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "TourStop" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "TourStop" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "TourStop"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "SavedPlace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SavedPlace" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "SavedPlace"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );

ALTER TABLE "ClientImport" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "ClientImport" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "ClientImport"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );
