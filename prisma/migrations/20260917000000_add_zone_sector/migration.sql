-- Secteur d'intervention d'une zone : un lieu et un rayon autour.
-- Purement additif et nullable : aucune zone existante n'est modifiée, et le
-- rattachement par communes/codes postaux continue de fonctionner tel quel.
ALTER TABLE "Zone" ADD COLUMN     "centerLabel" TEXT,
ADD COLUMN     "centerLatitude" DOUBLE PRECISION,
ADD COLUMN     "centerLongitude" DOUBLE PRECISION,
ADD COLUMN     "radiusKm" INTEGER;
