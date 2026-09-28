-- Précision des positions clients (carte clients, phase 6) et trace du
-- rattrapage « Localiser les clients sans position ».
CREATE TYPE "GeocodePrecision" AS ENUM ('EXACT', 'STREET', 'CITY');

ALTER TABLE "Client" ADD COLUMN "geocodePrecision" "GeocodePrecision";

ALTER TYPE "AuditAction" ADD VALUE 'CLIENTS_GEOCODED';
