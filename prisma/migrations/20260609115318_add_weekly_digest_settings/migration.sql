-- AlterTable
ALTER TABLE "user_settings" ADD COLUMN     "weekly_digest" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "weekly_digest_day" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "weekly_digest_providers" TEXT NOT NULL DEFAULT '';
