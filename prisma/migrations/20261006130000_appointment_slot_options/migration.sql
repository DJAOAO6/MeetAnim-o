-- Demandes à plusieurs horaires (chantier C8) : une demande en attente peut
-- proposer jusqu'à 3 horaires ; chacun est verrouillé jusqu'à ce que le
-- professionnel en retienne un. Uniquement additive.

-- CreateTable
CREATE TABLE "AppointmentSlotOption" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start" TEXT NOT NULL,
    "rank" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes',

    CONSTRAINT "AppointmentSlotOption_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AppointmentSlotOption_organizationId_date_idx" ON "AppointmentSlotOption"("organizationId", "date");

-- CreateIndex
CREATE INDEX "AppointmentSlotOption_appointmentId_idx" ON "AppointmentSlotOption"("appointmentId");

-- AddForeignKey
ALTER TABLE "AppointmentSlotOption" ADD CONSTRAINT "AppointmentSlotOption_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentSlotOption" ADD CONSTRAINT "AppointmentSlotOption_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Même cloisonnement que les autres tables d'un espace (voir
-- 20260922170000_row_level_security).
ALTER TABLE "AppointmentSlotOption" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AppointmentSlotOption" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "AppointmentSlotOption"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );
