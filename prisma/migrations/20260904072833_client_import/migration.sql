-- CreateEnum
CREATE TYPE "ClientImportStatus" AS ENUM ('RUNNING', 'COMPLETED', 'FAILED', 'UNDONE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CLIENTS_IMPORTED';
ALTER TYPE "AuditAction" ADD VALUE 'CLIENT_IMPORT_UNDONE';

-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "importId" TEXT;

-- AlterTable
ALTER TABLE "Client" ADD COLUMN     "importId" TEXT,
ADD COLUMN     "postalCode" TEXT;

-- CreateTable
CREATE TABLE "ClientImport" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "fileName" TEXT NOT NULL,
    "totalRows" INTEGER NOT NULL,
    "conflictPolicy" TEXT NOT NULL,
    "createdClients" INTEGER NOT NULL DEFAULT 0,
    "createdAnimals" INTEGER NOT NULL DEFAULT 0,
    "mergedClients" INTEGER NOT NULL DEFAULT 0,
    "skippedRows" INTEGER NOT NULL DEFAULT 0,
    "errorRows" INTEGER NOT NULL DEFAULT 0,
    "status" "ClientImportStatus" NOT NULL DEFAULT 'RUNNING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClientImport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientImport_userId_createdAt_idx" ON "ClientImport"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Animal_importId_idx" ON "Animal"("importId");

-- CreateIndex
CREATE INDEX "Client_importId_idx" ON "Client"("importId");

-- AddForeignKey
ALTER TABLE "ClientImport" ADD CONSTRAINT "ClientImport_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Client" ADD CONSTRAINT "Client_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ClientImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_importId_fkey" FOREIGN KEY ("importId") REFERENCES "ClientImport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
