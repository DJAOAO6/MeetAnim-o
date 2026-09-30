-- Journal : enregistrement et suppression d'un lieu d'animaux (phase 8.9).
-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'PLACE_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'PLACE_DELETED';

