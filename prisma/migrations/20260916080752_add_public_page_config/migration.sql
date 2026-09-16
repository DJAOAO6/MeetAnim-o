-- AlterTable
ALTER TABLE "BusinessProfile" ADD COLUMN     "publicPageDraft" JSONB,
ADD COLUMN     "publicPagePublished" JSONB,
ADD COLUMN     "publicPagePublishedAt" TIMESTAMP(3);
