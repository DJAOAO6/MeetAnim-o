-- Multi-comptes : un créneau n'est pris que dans son propre cabinet.
--
-- L'index unique posé le 28 août 2026 (20260828104850) interdisait deux
-- rendez-vous actifs à la même date et à la même heure dans toute la base —
-- juste tant qu'il n'y avait qu'un cabinet. À deux, le 9 h d'un professionnel
-- empêcherait celui d'un autre. La règle reste la même, par cabinet.
--
-- Sans risque pour les données existantes : ce qui était unique pour toute
-- la base l'est a fortiori pour chaque cabinet.

DROP INDEX "Appointment_date_start_active_key";

CREATE UNIQUE INDEX "Appointment_organizationId_date_start_active_key"
  ON "Appointment" ("organizationId", "date", "start")
  WHERE "status" <> 'CANCELLED';

-- L'index simple de la phase 1 est désormais couvert par le précédent.
DROP INDEX "Appointment_organizationId_date_start_idx";
