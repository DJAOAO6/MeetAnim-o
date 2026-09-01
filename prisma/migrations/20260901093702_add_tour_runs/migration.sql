-- CreateEnum
CREATE TYPE "TourEndpointType" AS ENUM ('CABINET', 'HOME', 'FAVORITE', 'CUSTOM', 'CURRENT_LOCATION', 'LAST_APPOINTMENT', 'SAME_AS_START');

-- CreateEnum
CREATE TYPE "TourStopType" AS ENUM ('APPOINTMENT', 'BREAK', 'MEAL', 'CABINET', 'HOME', 'CLINIC', 'STABLE', 'SUPPLIER', 'OTHER');

-- CreateEnum
CREATE TYPE "SavedPlaceType" AS ENUM ('CABINET', 'HOME', 'CLINIC', 'STABLE', 'OTHER');

-- CreateEnum
CREATE TYPE "OptimizationPreference" AS ENUM ('TIME', 'DISTANCE', 'BALANCED');

-- CreateTable
CREATE TABLE "TourRun" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "startType" "TourEndpointType" NOT NULL,
    "startLabel" TEXT,
    "startAddress" TEXT,
    "startLatitude" DOUBLE PRECISION,
    "startLongitude" DOUBLE PRECISION,
    "startSavedPlaceId" TEXT,
    "endType" "TourEndpointType" NOT NULL,
    "endLabel" TEXT,
    "endAddress" TEXT,
    "endLatitude" DOUBLE PRECISION,
    "endLongitude" DOUBLE PRECISION,
    "endSavedPlaceId" TEXT,
    "totalDistanceMeters" INTEGER,
    "totalDurationSeconds" INTEGER,
    "routeGeometry" JSONB,
    "routeComputedAt" TIMESTAMP(3),
    "safetyBufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "lunchBreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lunchBreakStart" TEXT,
    "lunchBreakEnd" TEXT,
    "optimizationPreference" "OptimizationPreference" NOT NULL DEFAULT 'BALANCED',
    "avoidTolls" BOOLEAN NOT NULL DEFAULT false,
    "avoidHighways" BOOLEAN NOT NULL DEFAULT false,
    "avoidFerries" BOOLEAN NOT NULL DEFAULT false,
    "lastOptimizationProposal" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourStop" (
    "id" TEXT NOT NULL,
    "tourRunId" TEXT NOT NULL,
    "appointmentId" TEXT,
    "order" INTEGER NOT NULL,
    "type" "TourStopType" NOT NULL,
    "label" TEXT NOT NULL,
    "address" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "arrivalTime" TEXT,
    "departureTime" TEXT,
    "serviceDurationMinutes" INTEGER,
    "flexible" BOOLEAN NOT NULL DEFAULT false,
    "locked" BOOLEAN NOT NULL DEFAULT true,
    "timeWindowStart" TEXT,
    "timeWindowEnd" TEXT,
    "legDistanceMeters" INTEGER,
    "legDurationSeconds" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourStop_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SavedPlace" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" "SavedPlaceType" NOT NULL,
    "address" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "isDefaultStart" BOOLEAN NOT NULL DEFAULT false,
    "isDefaultEnd" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SavedPlace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TourPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "defaultStartType" "TourEndpointType" NOT NULL DEFAULT 'CABINET',
    "defaultStartSavedPlaceId" TEXT,
    "defaultEndType" "TourEndpointType" NOT NULL DEFAULT 'CABINET',
    "defaultEndSavedPlaceId" TEXT,
    "returnToStart" BOOLEAN NOT NULL DEFAULT false,
    "safetyBufferMinutes" INTEGER NOT NULL DEFAULT 10,
    "lunchBreakEnabled" BOOLEAN NOT NULL DEFAULT false,
    "lunchBreakStart" TEXT NOT NULL DEFAULT '12:00',
    "lunchBreakEnd" TEXT NOT NULL DEFAULT '13:00',
    "workHoursStart" TEXT NOT NULL DEFAULT '08:00',
    "workHoursEnd" TEXT NOT NULL DEFAULT '19:00',
    "optimizationPreference" "OptimizationPreference" NOT NULL DEFAULT 'BALANCED',
    "avoidTolls" BOOLEAN NOT NULL DEFAULT false,
    "avoidHighways" BOOLEAN NOT NULL DEFAULT false,
    "avoidFerries" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TourPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TourRun_userId_date_idx" ON "TourRun"("userId", "date");

-- CreateIndex
CREATE INDEX "TourStop_tourRunId_idx" ON "TourStop"("tourRunId");

-- CreateIndex
CREATE INDEX "TourStop_appointmentId_idx" ON "TourStop"("appointmentId");

-- CreateIndex
CREATE UNIQUE INDEX "TourStop_tourRunId_order_key" ON "TourStop"("tourRunId", "order");

-- CreateIndex
CREATE INDEX "SavedPlace_userId_idx" ON "SavedPlace"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "TourPreferences_userId_key" ON "TourPreferences"("userId");

-- AddForeignKey
ALTER TABLE "TourRun" ADD CONSTRAINT "TourRun_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRun" ADD CONSTRAINT "TourRun_startSavedPlaceId_fkey" FOREIGN KEY ("startSavedPlaceId") REFERENCES "SavedPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourRun" ADD CONSTRAINT "TourRun_endSavedPlaceId_fkey" FOREIGN KEY ("endSavedPlaceId") REFERENCES "SavedPlace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_tourRunId_fkey" FOREIGN KEY ("tourRunId") REFERENCES "TourRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourStop" ADD CONSTRAINT "TourStop_appointmentId_fkey" FOREIGN KEY ("appointmentId") REFERENCES "Appointment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedPlace" ADD CONSTRAINT "SavedPlace_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TourPreferences" ADD CONSTRAINT "TourPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

