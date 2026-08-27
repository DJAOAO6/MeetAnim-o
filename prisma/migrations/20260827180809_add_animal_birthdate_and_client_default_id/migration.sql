-- AlterTable
ALTER TABLE "Animal" ADD COLUMN     "birthDate" TIMESTAMP(3),
ADD COLUMN     "birthDateApproximate" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE INDEX "Client_email_idx" ON "Client"("email");
