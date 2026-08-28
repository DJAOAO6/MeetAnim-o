-- Filet de sécurité au niveau base de données contre la race condition
-- documentée dans hasConflict() (src/lib/appointments-actions.ts) : deux
-- écritures concurrentes sur le même créneau (même date, même heure de
-- départ) passaient toutes les deux, faute de contrainte. Un index unique
-- partiel (PostgreSQL) est utilisé plutôt qu'un @@unique dans schema.prisma
-- car le langage de schéma Prisma ne permet pas d'exprimer une clause WHERE
-- sur un index unique — ce n'est donc pas modélisable directement dans
-- schema.prisma, uniquement via SQL brut dans la migration.
--
-- Ne couvre que la duplication exacte (même date, même heure de départ) :
-- la détection des chevauchements de créneaux (durées différentes qui se
-- recouvrent partiellement) reste une vérification applicative dans
-- hasConflict(), pas une contrainte SQL (une contrainte d'exclusion sur
-- intervalles serait disproportionnée pour un praticien seul à faible
-- volume de réservations).
CREATE UNIQUE INDEX "Appointment_date_start_active_key"
  ON "Appointment" ("date", "start")
  WHERE "status" != 'CANCELLED';
