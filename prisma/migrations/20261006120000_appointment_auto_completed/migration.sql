-- Rendez-vous réalisé automatiquement, l'heure passée (chantier C7) : la
-- fiche le signale et propose « Client absent — annuler ».

ALTER TABLE "Appointment" ADD COLUMN "completedAutomatically" BOOLEAN NOT NULL DEFAULT false;
