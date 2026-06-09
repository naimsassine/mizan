-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('gmail', 'outlook');

-- AlterTable
ALTER TABLE "email_connections" ADD COLUMN "email_provider" "EmailProvider" NOT NULL DEFAULT 'gmail';
