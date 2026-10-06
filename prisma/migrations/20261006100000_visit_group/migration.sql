-- Visites multi-animaux (chantier C6) : les rendez-vous d'un même lot,
-- enchaînés chez un même client, partagent un identifiant de visite.
-- Vide pour tout rendez-vous seul, dont tous les existants.

ALTER TABLE "Appointment" ADD COLUMN "visitGroupId" TEXT;

CREATE INDEX "Appointment_organizationId_visitGroupId_idx" ON "Appointment"("organizationId", "visitGroupId");
