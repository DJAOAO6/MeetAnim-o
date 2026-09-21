-- Mode d'exercice : domicile uniquement, cabinet uniquement, ou les deux.
-- Réglage permanent, distinct des fermetures temporaires cabinetAvailable /
-- homeAvailable. Les cabinets existants gardent les deux modes (BOTH).
CREATE TYPE "PracticeMode" AS ENUM ('HOME_ONLY', 'OFFICE_ONLY', 'BOTH');

ALTER TABLE "BusinessProfile"
  ADD COLUMN "practiceMode" "PracticeMode" NOT NULL DEFAULT 'BOTH',
  -- Point de départ des tournées quand il n'y a pas de cabinet. Privé :
  -- jamais affiché sur la page publique.
  ADD COLUMN "departureLabel" TEXT,
  ADD COLUMN "departureAddress" TEXT,
  ADD COLUMN "departureLatitude" DOUBLE PRECISION,
  ADD COLUMN "departureLongitude" DOUBLE PRECISION;
