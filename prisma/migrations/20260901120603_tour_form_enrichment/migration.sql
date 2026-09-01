-- CreateEnum
CREATE TYPE "TourStartType" AS ENUM ('CABINET', 'CUSTOM');

-- AlterTable
ALTER TABLE "Tour" ADD COLUMN     "maxStops" INTEGER,
ADD COLUMN     "note" TEXT,
ADD COLUMN     "startAddress" TEXT,
ADD COLUMN     "startLatitude" DOUBLE PRECISION,
ADD COLUMN     "startLongitude" DOUBLE PRECISION,
ADD COLUMN     "startType" "TourStartType" NOT NULL DEFAULT 'CABINET';

-- CreateTable
CREATE TABLE "_TourZones" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL,

    CONSTRAINT "_TourZones_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE INDEX "_TourZones_B_index" ON "_TourZones"("B");

-- AddForeignKey
ALTER TABLE "_TourZones" ADD CONSTRAINT "_TourZones_A_fkey" FOREIGN KEY ("A") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_TourZones" ADD CONSTRAINT "_TourZones_B_fkey" FOREIGN KEY ("B") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Reprise de données : chaque tournée existante reçoit automatiquement sa
-- zone actuelle (zoneId) dans la nouvelle liste multi-zone, pour ne pas
-- afficher "Zones" vide dans le nouveau formulaire tant que la tournée n'a
-- pas été rouverte/enregistrée.
INSERT INTO "_TourZones" ("A", "B")
SELECT "id", "zoneId" FROM "Tour"
ON CONFLICT DO NOTHING;
