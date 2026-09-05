-- CreateEnum
CREATE TYPE "StudioDocumentStatus" AS ENUM ('DRAFT', 'FINALIZED');

-- CreateTable
CREATE TABLE "StudioDocument" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" "StudioDocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "clientId" TEXT,
    "animalId" TEXT,
    "appointmentId" TEXT,
    "templateId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "contentJson" JSONB NOT NULL,
    "pdfBase64" TEXT,
    "thumbnail" TEXT,
    "finalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StudioDocumentTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT,
    "contentJson" JSONB NOT NULL,
    "thumbnail" TEXT,
    "isBuiltIn" BOOLEAN NOT NULL DEFAULT false,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StudioDocumentTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "StudioDocument_appointmentId_key" ON "StudioDocument"("appointmentId");

-- CreateIndex
CREATE INDEX "StudioDocument_clientId_idx" ON "StudioDocument"("clientId");

-- CreateIndex
CREATE INDEX "StudioDocument_animalId_idx" ON "StudioDocument"("animalId");

-- CreateIndex
CREATE INDEX "StudioDocument_createdByUserId_idx" ON "StudioDocument"("createdByUserId");

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "StudioDocumentTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocument" ADD CONSTRAINT "StudioDocument_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StudioDocumentTemplate" ADD CONSTRAINT "StudioDocumentTemplate_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
