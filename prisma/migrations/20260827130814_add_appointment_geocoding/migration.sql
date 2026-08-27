-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN     "city" TEXT,
ADD COLUMN     "inseeCode" TEXT,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "postalCode" TEXT;
