-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('ACTIF', 'INACTIF');

-- CreateEnum
CREATE TYPE "VisitMode" AS ENUM ('CABINET', 'DOMICILE');

-- CreateEnum
CREATE TYPE "ConsultationStatus" AS ENUM ('TERMINE', 'ANNULE');

-- CreateEnum
CREATE TYPE "AppointmentStatus" AS ENUM ('PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('DUE', 'SENT', 'BOOKED', 'IGNORED', 'UPCOMING');

-- CreateEnum
CREATE TYPE "ReminderDelay" AS ENUM ('THREE_MONTHS', 'SIX_MONTHS', 'TWELVE_MONTHS', 'CUSTOM');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PDF', 'IMAGE');

-- CreateEnum
CREATE TYPE "TourStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TravelFeeMode" AS ENUM ('FIXED', 'ZONE', 'KILOMETRIC');

-- CreateTable
CREATE TABLE "Client" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "status" "ClientStatus" NOT NULL DEFAULT 'ACTIF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Animal" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "species" TEXT NOT NULL,
    "breed" TEXT NOT NULL,
    "age" TEXT NOT NULL,
    "weight" TEXT NOT NULL,
    "sex" TEXT NOT NULL,
    "avatar" TEXT NOT NULL,
    "avatarBackground" TEXT NOT NULL,
    "photo" TEXT,
    "history" TEXT NOT NULL,
    "conditions" TEXT NOT NULL,
    "treatments" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "reminderLabel" TEXT,
    "reminderDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Animal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Consultation" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "service" TEXT NOT NULL,
    "mode" "VisitMode" NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "summary" TEXT NOT NULL,
    "status" "ConsultationStatus" NOT NULL DEFAULT 'TERMINE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Consultation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnimalDocument" (
    "id" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "DocumentType" NOT NULL,
    "linkedTo" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnimalDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Appointment" (
    "id" TEXT NOT NULL,
    "clientId" TEXT,
    "animalId" TEXT,
    "clientName" TEXT NOT NULL,
    "animalName" TEXT NOT NULL,
    "serviceName" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "start" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "mode" "VisitMode" NOT NULL,
    "location" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING',
    "notes" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Appointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reminder" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "animalId" TEXT NOT NULL,
    "lastConsultation" TIMESTAMP(3) NOT NULL,
    "delay" "ReminderDelay" NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'DUE',
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "postalCode" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Tour" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "recurrence" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "dateId" TEXT,
    "dateLabel" TEXT NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "status" "TourStatus" NOT NULL DEFAULT 'ACTIVE',
    "appointmentCount" INTEGER NOT NULL DEFAULT 0,
    "estimatedKm" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "consultationHours" TEXT NOT NULL,

    CONSTRAINT "Tour_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourAppointment" (
    "id" TEXT NOT NULL,
    "tourId" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "animalName" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "TourAppointment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Service" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "duration" INTEGER NOT NULL,
    "animals" TEXT[],
    "cabinetEnabled" BOOLEAN NOT NULL DEFAULT true,
    "cabinetPrice" DOUBLE PRECISION NOT NULL,
    "homeEnabled" BOOLEAN NOT NULL DEFAULT true,
    "homePrice" DOUBLE PRECISION NOT NULL,
    "travelFeesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "travelFeeMode" "TravelFeeMode" NOT NULL DEFAULT 'FIXED',
    "fixedTravelFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "zoneFees" JSONB,
    "kilometricRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "suggestedReminder" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Service_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Client_lastName_firstName_idx" ON "Client"("lastName", "firstName");

-- CreateIndex
CREATE INDEX "Animal_clientId_idx" ON "Animal"("clientId");

-- CreateIndex
CREATE INDEX "Consultation_animalId_idx" ON "Consultation"("animalId");

-- CreateIndex
CREATE INDEX "AnimalDocument_animalId_idx" ON "AnimalDocument"("animalId");

-- CreateIndex
CREATE INDEX "Appointment_clientId_idx" ON "Appointment"("clientId");

-- CreateIndex
CREATE INDEX "Appointment_animalId_idx" ON "Appointment"("animalId");

-- CreateIndex
CREATE INDEX "Appointment_date_idx" ON "Appointment"("date");

-- CreateIndex
CREATE INDEX "Reminder_clientId_idx" ON "Reminder"("clientId");

-- CreateIndex
CREATE INDEX "Reminder_animalId_idx" ON "Reminder"("animalId");

-- CreateIndex
CREATE INDEX "City_zoneId_idx" ON "City"("zoneId");

-- CreateIndex
CREATE INDEX "Tour_zoneId_idx" ON "Tour"("zoneId");

-- CreateIndex
CREATE INDEX "TourAppointment_tourId_idx" ON "TourAppointment"("tourId");

-- AddForeignKey
ALTER TABLE "Animal" ADD CONSTRAINT "Animal_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Consultation" ADD CONSTRAINT "Consultation_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnimalDocument" ADD CONSTRAINT "AnimalDocument_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_animalId_fkey" FOREIGN KEY ("animalId") REFERENCES "Animal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "City" ADD CONSTRAINT "City_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Tour" ADD CONSTRAINT "Tour_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourAppointment" ADD CONSTRAINT "TourAppointment_tourId_fkey" FOREIGN KEY ("tourId") REFERENCES "Tour"("id") ON DELETE CASCADE ON UPDATE CASCADE;
