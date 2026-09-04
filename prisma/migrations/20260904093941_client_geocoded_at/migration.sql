-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "geocodedAt" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Client_latitude_longitude_idx" ON "Client"("latitude", "longitude");
