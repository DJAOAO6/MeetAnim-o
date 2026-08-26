-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'ANIMAL_DELETED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "permissions" TEXT[] DEFAULT ARRAY[]::TEXT[];
