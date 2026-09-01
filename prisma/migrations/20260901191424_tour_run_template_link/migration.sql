-- AlterTable
ALTER TABLE "TourRun" ADD COLUMN     "templateId" TEXT;

-- CreateIndex
CREATE INDEX "TourRun_templateId_idx" ON "TourRun"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "TourRun_templateId_date_userId_key" ON "TourRun"("templateId", "date", "userId");

-- AddForeignKey
ALTER TABLE "TourRun" ADD CONSTRAINT "TourRun_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Tour"("id") ON DELETE SET NULL ON UPDATE CASCADE;

