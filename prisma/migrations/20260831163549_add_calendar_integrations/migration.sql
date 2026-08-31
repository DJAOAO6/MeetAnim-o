-- CreateEnum
CREATE TYPE "CalendarProviderKind" AS ENUM ('GOOGLE', 'MICROSOFT', 'APPLE');

-- CreateEnum
CREATE TYPE "CalendarSyncStatus" AS ENUM ('SYNCED', 'PENDING', 'ERROR');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AuditAction" ADD VALUE 'CALENDAR_CONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'CALENDAR_DISCONNECTED';
ALTER TYPE "AuditAction" ADD VALUE 'CALENDAR_SETTINGS_UPDATED';
ALTER TYPE "AuditAction" ADD VALUE 'CALENDAR_FEED_TOKEN_REGENERATED';

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "icsFeedToken" TEXT;

-- CreateTable
CREATE TABLE "CalendarConnection" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "provider" "CalendarProviderKind" NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "accountEmail" TEXT NOT NULL,
    "calendarId" TEXT NOT NULL,
    "calendarName" TEXT NOT NULL,
    "accessTokenEncrypted" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "accessTokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "syncAppointments" BOOLEAN NOT NULL DEFAULT true,
    "syncUpdates" BOOLEAN NOT NULL DEFAULT true,
    "deleteCancelledEvents" BOOLEAN NOT NULL DEFAULT true,
    "blockExternalBusySlots" BOOLEAN NOT NULL DEFAULT true,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CalendarConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppointmentCalendarEvent" (
    "id" TEXT NOT NULL,
    "appointmentId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "externalEventId" TEXT NOT NULL,
    "status" "CalendarSyncStatus" NOT NULL DEFAULT 'SYNCED',
    "lastError" TEXT,
    "lastSyncAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AppointmentCalendarEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CalendarConnection_userId_idx" ON "CalendarConnection"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "CalendarConnection_userId_provider_key" ON "CalendarConnection"("userId", "provider");

-- CreateIndex
CREATE INDEX "AppointmentCalendarEvent_connectionId_idx" ON "AppointmentCalendarEvent"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "AppointmentCalendarEvent_appointmentId_connectionId_key" ON "AppointmentCalendarEvent"("appointmentId", "connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "User_icsFeedToken_key" ON "User"("icsFeedToken");

-- AddForeignKey
ALTER TABLE "CalendarConnection" ADD CONSTRAINT "CalendarConnection_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppointmentCalendarEvent" ADD CONSTRAINT "AppointmentCalendarEvent_connectionId_fkey" FOREIGN KEY ("connectionId") REFERENCES "CalendarConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

