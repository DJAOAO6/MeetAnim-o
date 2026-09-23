-- Préférence de chaque compte : annoncer les nouvelles demandes de
-- rendez-vous par le teckel qui traverse l'écran. Activée par défaut ; se
-- règle dans Paramètres › Personnalisation › Tableau de bord.
ALTER TABLE "User" ADD COLUMN "newRequestAnimation" BOOLEAN NOT NULL DEFAULT true;
