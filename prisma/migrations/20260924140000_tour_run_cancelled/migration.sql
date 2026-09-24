-- Journée de tournée annulée : retenue pour ne pas être régénérée ni affichée.
ALTER TABLE "TourRun" ADD COLUMN "cancelledAt" TIMESTAMP(3);
