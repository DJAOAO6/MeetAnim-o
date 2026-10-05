-- Secteur d'intervention (chantier C4, phase 2) : une commune de départ et
-- un rayon. Le texte public (`location`) en est généré ; un espace existant
-- sans secteur garde son texte libre jusqu'à ce qu'il en choisisse un.
-- Rayon vide avec une commune : « pas de limite ».
ALTER TABLE "BusinessProfile" ADD COLUMN "serviceAreaLabel" TEXT,
ADD COLUMN "serviceAreaLatitude" DOUBLE PRECISION,
ADD COLUMN "serviceAreaLongitude" DOUBLE PRECISION,
ADD COLUMN "serviceAreaRadiusKm" INTEGER;
