-- Consultation liée au rendez-vous qui l'a créée (chantier C7) : un
-- rendez-vous ne crée jamais deux consultations, et annuler un rendez-vous
-- réalisé retire la sienne. Vide pour les consultations existantes, saisies
-- à la main ou créées avant ce lien.

ALTER TABLE "Consultation" ADD COLUMN "appointmentId" TEXT;

CREATE UNIQUE INDEX "Consultation_appointmentId_key" ON "Consultation"("appointmentId");

ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;
