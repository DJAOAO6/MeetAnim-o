-- Rappel de rendez-vous : « réservé » distinct d'« envoyé » (audit 2026-10,
-- FONC-10). Un rappel réservé puis interrompu par un arrêt du serveur était
-- perdu ; il est désormais repris. Uniquement additive.
ALTER TABLE "Appointment" ADD COLUMN "reminderClaimedAt" TIMESTAMP(3);
