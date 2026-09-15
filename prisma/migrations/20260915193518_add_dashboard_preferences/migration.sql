-- CreateTable
CREATE TABLE "DashboardPreferences" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "widgets" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DashboardPreferences_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DashboardPreferences_userId_key" ON "DashboardPreferences"("userId");

-- AddForeignKey
ALTER TABLE "DashboardPreferences" ADD CONSTRAINT "DashboardPreferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
