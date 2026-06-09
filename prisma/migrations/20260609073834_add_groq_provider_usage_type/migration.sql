-- CreateEnum
CREATE TYPE "UsageType" AS ENUM ('api', 'subscription');

-- AlterEnum
ALTER TYPE "Provider" ADD VALUE 'groq';

-- AlterTable
ALTER TABLE "receipts" ADD COLUMN     "usage_type" "UsageType" NOT NULL DEFAULT 'api';
