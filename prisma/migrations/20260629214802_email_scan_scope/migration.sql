-- CreateEnum
CREATE TYPE "EmailScanScope" AS ENUM ('all', 'subscription');

-- AlterTable
ALTER TABLE "email_connections" ADD COLUMN     "scan_scope" "EmailScanScope" NOT NULL DEFAULT 'all';
