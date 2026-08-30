-- DropForeignKey
ALTER TABLE "TourAppointment" DROP CONSTRAINT "TourAppointment_tourId_fkey";

-- AlterTable
ALTER TABLE "Tour" DROP COLUMN "appointmentCount",
DROP COLUMN "consultationHours";

-- DropTable
DROP TABLE "TourAppointment";
