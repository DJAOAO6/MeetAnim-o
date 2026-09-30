-- Lieux des animaux (phase 8.9) : haras, élevage, pension… partagés par
-- plusieurs animaux. Uniquement additive : tous les animaux existants gardent
-- placeId = NULL, c'est-à-dire « chez leur propriétaire », comme avant.
-- CreateEnum
CREATE TYPE "AnimalPlaceKind" AS ENUM ('HARAS', 'ELEVAGE', 'EXPLOITATION', 'CENTRE_EQUESTRE', 'REFUGE', 'AUTRE');

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "placeId" TEXT;

-- CreateTable
CREATE TABLE "AnimalPlace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "AnimalPlaceKind" NOT NULL DEFAULT 'AUTRE',
    "address" TEXT NOT NULL,
    "postalCode" TEXT,
    "city" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "geocodePrecision" "GeocodePrecision",
    "geocodedAt" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "organizationId" TEXT NOT NULL DEFAULT 'org-1002-pattes',

    CONSTRAINT "AnimalPlace_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AnimalPlace_organizationId_idx" ON "AnimalPlace"("organizationId");

-- CreateIndex
CREATE INDEX "Animal_placeId_idx" ON "Animal"("placeId");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_placeId_fkey" FOREIGN KEY ("placeId") REFERENCES "AnimalPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalPlace" ADD CONSTRAINT "AnimalPlace_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Même cloisonnement que les autres tables d'un espace (voir
-- 20260922170000_row_level_security).
ALTER TABLE "AnimalPlace" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnimalPlace" FORCE ROW LEVEL SECURITY;
CREATE POLICY "cloisonnement_espace" ON "AnimalPlace"
  USING (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  )
  WITH CHECK (
    COALESCE(current_setting('app.organization_id', true), '') = ''
    OR "organizationId" = current_setting('app.organization_id', true)
  );
